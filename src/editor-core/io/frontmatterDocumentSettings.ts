import type { LineBreakPolicy, MarkdownDocumentOptions } from "../types";
import type {
  DocumentTypeWritingModeDefaults,
  WritingMode,
} from "../../settings/types";
import { splitLeadingFrontmatter, type FrontmatterFields } from "./frontmatter";

export type DocumentType = "novel" | "article" | null;

export type FrontmatterKnownScalarPatch = {
  documentType?: DocumentType;
  nyozePreserveEmptyParagraphs?: boolean | null;
  title?: string | null;
  author?: string | null;
  translator?: string | null;
  /** 文書単位の表示方向。`vertical-rl` / `horizontal-tb` を書き込み、null で key を削除。 */
  writingMode?: WritingMode | null;
};

type DocumentTypeScalarResolution = {
  recognized: boolean;
  documentType: DocumentType;
};

type FrontmatterLine = {
  text: string;
  ending: string;
  raw: string;
};

type FrontmatterEntry = {
  key: string;
  startIndex: number;
  endIndex: number;
  rawValue: string;
  inlineComment: string;
};

type ParsedFrontmatter = {
  openingLine: FrontmatterLine;
  closingLine: FrontmatterLine;
  bodyLines: FrontmatterLine[];
  entries: Map<string, FrontmatterEntry>;
  safeToPatch: boolean;
};

const EDITABLE_KEYS = new Set([
  "nyozeType",
  "nyozePreserveEmptyParagraphs",
  "title",
  "author",
  "translator",
  "writingMode",
]);

function splitLinesPreserveEnding(value: string): FrontmatterLine[] {
  const lines: FrontmatterLine[] = [];
  let cursor = 0;
  while (cursor < value.length) {
    let end = cursor;
    while (end < value.length && value[end] !== "\n" && value[end] !== "\r") {
      end += 1;
    }

    let ending = "";
    if (end < value.length) {
      if (value[end] === "\r" && value[end + 1] === "\n") {
        ending = "\r\n";
        end += 2;
      } else {
        ending = value[end];
        end += 1;
      }
    }

    const raw = value.slice(cursor, end);
    const text = raw.slice(0, raw.length - ending.length);
    lines.push({ text, ending, raw });
    cursor = end;
  }
  return lines;
}

function isFenceLine(line: string): boolean {
  return /^---[ \t]*$/.test(line);
}

function isBlankOrCommentLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.length === 0 || trimmed.startsWith("#");
}

function hasIndent(line: string): boolean {
  return /^[ \t]+/.test(line);
}

function matchTopLevelKey(line: string): { key: string; rawValue: string } | null {
  const match = line.match(/^([A-Za-z0-9_-]+):(.*)$/);
  if (!match) return null;
  return {
    key: match[1],
    rawValue: match[2].replace(/^[ \t]*/, ""),
  };
}

function splitInlineComment(rawValue: string): { value: string; inlineComment: string } {
  let inSingle = false;
  let inDouble = false;
  let escape = false;

  for (let index = 0; index < rawValue.length; index += 1) {
    const char = rawValue[index];
    if (inDouble) {
      if (escape) {
        escape = false;
      } else if (char === "\\") {
        escape = true;
      } else if (char === '"') {
        inDouble = false;
      }
      continue;
    }
    if (inSingle) {
      if (char === "'") {
        inSingle = false;
      }
      continue;
    }
    if (char === '"') {
      inDouble = true;
      continue;
    }
    if (char === "'") {
      inSingle = true;
      continue;
    }
    if (char === "#") {
      if (index === 0 || /\s/.test(rawValue[index - 1])) {
        const value = rawValue.slice(0, index).replace(/[ \t]+$/, "");
        return {
          value,
          inlineComment: rawValue.slice(index).trimStart(),
        };
      }
    }
  }

  return {
    value: rawValue.replace(/[ \t]+$/, ""),
    inlineComment: "",
  };
}

function isComplexEditableScalar(rawValue: string): boolean {
  const { value } = splitInlineComment(rawValue);
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  return /^(?:\[|\{|\||>|&|\*|!)/.test(trimmed);
}

function parseFrontmatterStructure(frontmatterPrefix: string): ParsedFrontmatter | null {
  if (!frontmatterPrefix) return null;
  const split = splitLeadingFrontmatter(frontmatterPrefix);
  if (!split.hasFrontmatter || split.body !== "") return null;

  const lines = splitLinesPreserveEnding(frontmatterPrefix);
  if (lines.length < 2 || !isFenceLine(lines[0].text)) return null;

  let closingIndex = -1;
  for (let index = 1; index < lines.length; index += 1) {
    if (isFenceLine(lines[index].text)) {
      closingIndex = index;
      break;
    }
  }
  if (closingIndex <= 0 || closingIndex !== lines.length - 1) return null;

  const bodyLines = lines.slice(1, closingIndex);
  const entries = new Map<string, FrontmatterEntry>();
  let safeToPatch = true;

  for (let index = 0; index < bodyLines.length; ) {
    const current = bodyLines[index];
    if (isBlankOrCommentLine(current.text)) {
      index += 1;
      continue;
    }
    if (hasIndent(current.text)) {
      safeToPatch = false;
      break;
    }

    const keyMatch = matchTopLevelKey(current.text);
    if (!keyMatch) {
      safeToPatch = false;
      break;
    }

    const startIndex = index;
    let endIndex = index;
    index += 1;
    while (index < bodyLines.length) {
      const next = bodyLines[index];
      if (isBlankOrCommentLine(next.text)) break;
      if (!hasIndent(next.text)) break;
      endIndex = index;
      index += 1;
    }

    if (entries.has(keyMatch.key)) {
      safeToPatch = false;
    }
    if (EDITABLE_KEYS.has(keyMatch.key)) {
      if (endIndex > startIndex || isComplexEditableScalar(keyMatch.rawValue)) {
        safeToPatch = false;
      }
    }

    const { inlineComment } = splitInlineComment(keyMatch.rawValue);
    entries.set(keyMatch.key, {
      key: keyMatch.key,
      startIndex,
      endIndex,
      rawValue: keyMatch.rawValue,
      inlineComment,
    });
  }

  return {
    openingLine: lines[0],
    closingLine: lines[closingIndex],
    bodyLines,
    entries,
    safeToPatch,
  };
}

function canUsePlainScalar(value: string): boolean {
  if (value.length === 0) return false;
  if (/^\s|\s$/.test(value)) return false;
  if (/[:#[\]{}&,*!|>'"%@`]/.test(value)) return false;
  if (/^(?:true|false|null|~|yes|no|on|off)$/i.test(value)) return false;
  return true;
}

function formatYamlScalar(value: string): string {
  return canUsePlainScalar(value) ? value : JSON.stringify(value);
}

function formatManagedScalarValue(value: string | boolean): string {
  return typeof value === "boolean" ? (value ? "true" : "false") : formatYamlScalar(value);
}

function normalizePatchValue(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return value.trim().length === 0 ? null : value;
}

function normalizeBooleanPatchValue(
  value: boolean | null | undefined,
): boolean | null | undefined {
  if (value === undefined) return undefined;
  return value === true ? true : null;
}

function buildScalarLine(
  key:
    | "documentType"
    | "nyozeType"
    | "nyozePreserveEmptyParagraphs"
    | "title"
    | "author"
    | "translator"
    | "writingMode",
  value: string | boolean,
  inlineComment: string,
  ending: string,
): string {
  const commentSuffix = inlineComment ? ` ${inlineComment}` : "";
  return `${key}: ${formatManagedScalarValue(value)}${commentSuffix}${ending}`;
}

function buildFrontmatterFromScratch(
  patch: FrontmatterKnownScalarPatch,
  eol = "\n",
): string {
  const lines: string[] = [];
  const documentType = normalizePatchValue(patch.documentType);
  if (documentType !== undefined && documentType !== null) {
    lines.push(buildScalarLine("documentType", documentType, "", eol));
  }

  const writingMode = normalizePatchValue(patch.writingMode);
  if (writingMode !== undefined && writingMode !== null) {
    lines.push(buildScalarLine("writingMode", writingMode, "", eol));
  }

  const preserveEmptyParagraphs = normalizeBooleanPatchValue(
    patch.nyozePreserveEmptyParagraphs,
  );
  if (preserveEmptyParagraphs === true) {
    lines.push(buildScalarLine("nyozePreserveEmptyParagraphs", true, "", eol));
  }

  for (const key of ["title", "author", "translator"] as const) {
    const value = normalizePatchValue(patch[key]);
    if (value === undefined || value === null) continue;
    lines.push(buildScalarLine(key, value, "", eol));
  }
  if (lines.length === 0) return "";
  return `---${eol}${lines.join("")}---${eol}`;
}

function stripYamlScalarQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function readSimpleScalarEntryValue(entry: FrontmatterEntry): string | null {
  if (entry.endIndex > entry.startIndex) return null;
  if (isComplexEditableScalar(entry.rawValue)) return null;
  const { value } = splitInlineComment(entry.rawValue);
  const trimmed = value.trim();
  if (!trimmed) return null;
  return stripYamlScalarQuotes(trimmed);
}

export function resolveDocumentTypeScalarValue(
  value: string | undefined,
): DocumentTypeScalarResolution {
  if (value === "novel" || value === "article") {
    return { recognized: true, documentType: value };
  }
  if (value === "note") {
    return { recognized: true, documentType: null };
  }
  return { recognized: false, documentType: null };
}

function isManagedDocumentTypeEntry(entry: FrontmatterEntry): boolean {
  const value = readSimpleScalarEntryValue(entry);
  if (value === null) return false;
  return resolveDocumentTypeScalarValue(value).recognized;
}

export function resolveDocumentType(
  fields: Pick<FrontmatterFields, "documentType" | "nyozeType" | "type">,
): DocumentType {
  const documentType = resolveDocumentTypeScalarValue(fields.documentType);
  if (documentType.recognized) return documentType.documentType;
  const nyozeType = resolveDocumentTypeScalarValue(fields.nyozeType);
  if (nyozeType.recognized) return nyozeType.documentType;
  const compatType = resolveDocumentTypeScalarValue(fields.type);
  if (compatType.recognized) return compatType.documentType;
  return null;
}

export function resolveTypeDerivedLineBreakPolicy(
  type: DocumentType,
): LineBreakPolicy | null {
  if (type === "novel") return "obsidian-paragraph";
  if (type === "article") return "commonmark-strict";
  return null;
}

export function resolveTypeRecommendedWritingMode(
  type: DocumentType,
): WritingMode | null {
  if (type === "novel") return "vertical-rl";
  if (type === "article") return "horizontal-tb";
  return null;
}

/**
 * Document Type 別の既定表示方向を解決する（ユーザー設定可能）。
 * frontmatter `writingMode` が無い文書にだけ適用する。未設定文書も明示的に
 * 縦書き / 横書きを選んだ `defaults.unset` をそのまま使う。
 */
export function resolveTypeDefaultWritingMode(
  type: DocumentType,
  defaults: DocumentTypeWritingModeDefaults,
): WritingMode {
  if (type === "novel") return defaults.novel;
  if (type === "article") return defaults.article;
  return defaults.unset;
}

export type FrontmatterWritingModeResolution = {
  /** 有効な frontmatter `writingMode` 指定。無効・未設定なら null。 */
  writingMode: WritingMode | null;
  /** `writingMode` key は存在するが値が無効（complex / 未知値）な場合 true。 */
  unsupported: boolean;
};

/**
 * frontmatter `writingMode` の read-only 解釈。
 * 有効値は `vertical-rl` / `horizontal-tb` のみ。空・complex scalar・未知値は無効として無視する。
 * 書き込みは行わない（read-only）。
 */
export function resolveFrontmatterWritingMode(
  fields: Pick<FrontmatterFields, "writingMode">,
): FrontmatterWritingModeResolution {
  const raw = fields.writingMode;
  if (raw === undefined) return { writingMode: null, unsupported: false };
  const value = raw.trim();
  if (value === "vertical-rl" || value === "horizontal-tb") {
    return { writingMode: value, unsupported: false };
  }
  if (value.length === 0) return { writingMode: null, unsupported: false };
  return { writingMode: null, unsupported: true };
}

export type EffectiveWritingModeInput = {
  frontmatter: Pick<
    FrontmatterFields,
    "writingMode" | "documentType" | "nyozeType" | "type"
  >;
  /** タブ単位の現在値（手動切替後の値）。 */
  tabWritingMode: WritingMode;
  /** タブが Document Type 別の既定表示方向に追従しているか。手動切替で false。 */
  followsTypeRecommendation: boolean;
  /** Document Type 別の既定表示方向（ユーザー設定）。 */
  typeDefaults: DocumentTypeWritingModeDefaults;
};

/**
 * 実効表示方向を解決する pure helper。優先順位:
 * 1. タブ単位の手動切替（followsTypeRecommendation=false → tabWritingMode）
 * 2. frontmatter `writingMode`（read-only、有効値のみ）
 * 3. Document Type 別の既定表示方向（ユーザー設定。未設定文書も明示的に縦/横）
 */
export function resolveEffectiveWritingMode(
  input: EffectiveWritingModeInput,
): WritingMode {
  if (!input.followsTypeRecommendation) {
    return input.tabWritingMode;
  }
  const frontmatterWritingMode = resolveFrontmatterWritingMode(
    input.frontmatter,
  ).writingMode;
  if (frontmatterWritingMode) {
    return frontmatterWritingMode;
  }
  return resolveTypeDefaultWritingMode(
    resolveDocumentType(input.frontmatter),
    input.typeDefaults,
  );
}

function resolveManagedBooleanScalarValue(value: string | undefined): boolean {
  return /^(?:true|yes|on|1)$/i.test(value?.trim() ?? "");
}

export function resolvePreserveEmptyParagraphs(
  fields: Pick<
    FrontmatterFields,
    "documentType" | "nyozeType" | "type" | "nyozePreserveEmptyParagraphs"
  >,
): boolean {
  if (resolveDocumentType(fields) !== "article") return false;
  return resolveManagedBooleanScalarValue(fields.nyozePreserveEmptyParagraphs);
}

export function resolveDocumentMarkdownOptions(
  fields: Pick<
    FrontmatterFields,
    "documentType" | "nyozeType" | "type" | "nyozePreserveEmptyParagraphs"
  >,
): MarkdownDocumentOptions {
  return {
    preserveEmptyParagraphs: resolvePreserveEmptyParagraphs(fields),
  };
}

export function canSafelyPatchFrontmatter(frontmatterPrefix: string): boolean {
  if (!frontmatterPrefix) return true;
  const parsed = parseFrontmatterStructure(frontmatterPrefix);
  return parsed !== null && parsed.safeToPatch;
}

export function patchFrontmatterKnownScalars(
  frontmatterPrefix: string,
  patch: FrontmatterKnownScalarPatch,
): string {
  if (!frontmatterPrefix) {
    return buildFrontmatterFromScratch(patch);
  }

  const parsed = parseFrontmatterStructure(frontmatterPrefix);
  if (!parsed || !parsed.safeToPatch) {
    throw new Error("Unsafe frontmatter for Document Settings patch");
  }

  const eol =
    parsed.openingLine.ending || parsed.closingLine.ending || "\n";
  const nextBody = parsed.bodyLines.map((line) => line.raw);
  const mutations: Array<{ startIndex: number; endIndex: number; replacement: string[] }> = [];
  const insertions: string[] = [];

  const nextDocumentType = normalizePatchValue(patch.documentType);
  if (nextDocumentType !== undefined) {
    const documentTypeEntry = parsed.entries.get("documentType") ?? null;
    const nyozeTypeEntry = parsed.entries.get("nyozeType") ?? null;
    const canUseDocumentTypeKey =
      documentTypeEntry === null || isManagedDocumentTypeEntry(documentTypeEntry);

    if (nextDocumentType === null) {
      if (canUseDocumentTypeKey && documentTypeEntry) {
        mutations.push({
          startIndex: documentTypeEntry.startIndex,
          endIndex: documentTypeEntry.endIndex,
          replacement: [],
        });
      }
      if (nyozeTypeEntry) {
        mutations.push({
          startIndex: nyozeTypeEntry.startIndex,
          endIndex: nyozeTypeEntry.endIndex,
          replacement: [],
        });
      }
    } else if (canUseDocumentTypeKey) {
      if (documentTypeEntry) {
        const replacement = buildScalarLine(
          "documentType",
          nextDocumentType,
          documentTypeEntry.inlineComment,
          parsed.bodyLines[documentTypeEntry.startIndex]?.ending || eol,
        );
        mutations.push({
          startIndex: documentTypeEntry.startIndex,
          endIndex: documentTypeEntry.endIndex,
          replacement: [replacement],
        });
      } else if (nyozeTypeEntry) {
        const replacement = buildScalarLine(
          "documentType",
          nextDocumentType,
          nyozeTypeEntry.inlineComment,
          parsed.bodyLines[nyozeTypeEntry.startIndex]?.ending || eol,
        );
        mutations.push({
          startIndex: nyozeTypeEntry.startIndex,
          endIndex: nyozeTypeEntry.endIndex,
          replacement: [replacement],
        });
      } else {
        insertions.push(buildScalarLine("documentType", nextDocumentType, "", eol));
      }

      if (documentTypeEntry && nyozeTypeEntry) {
        mutations.push({
          startIndex: nyozeTypeEntry.startIndex,
          endIndex: nyozeTypeEntry.endIndex,
          replacement: [],
        });
      }
    } else if (nyozeTypeEntry) {
      const replacement = buildScalarLine(
        "nyozeType",
        nextDocumentType,
        nyozeTypeEntry.inlineComment,
        parsed.bodyLines[nyozeTypeEntry.startIndex]?.ending || eol,
      );
      mutations.push({
        startIndex: nyozeTypeEntry.startIndex,
        endIndex: nyozeTypeEntry.endIndex,
        replacement: [replacement],
      });
    } else {
      insertions.push(buildScalarLine("nyozeType", nextDocumentType, "", eol));
    }
  }

  const nextPreserveEmptyParagraphs = normalizeBooleanPatchValue(
    patch.nyozePreserveEmptyParagraphs,
  );
  if (nextPreserveEmptyParagraphs !== undefined) {
    const existingEntry =
      parsed.entries.get("nyozePreserveEmptyParagraphs") ?? null;

    if (nextPreserveEmptyParagraphs === null) {
      if (existingEntry) {
        mutations.push({
          startIndex: existingEntry.startIndex,
          endIndex: existingEntry.endIndex,
          replacement: [],
        });
      }
    } else if (existingEntry) {
      const replacement = buildScalarLine(
        "nyozePreserveEmptyParagraphs",
        true,
        existingEntry.inlineComment,
        parsed.bodyLines[existingEntry.startIndex]?.ending || eol,
      );
      mutations.push({
        startIndex: existingEntry.startIndex,
        endIndex: existingEntry.endIndex,
        replacement: [replacement],
      });
    } else {
      insertions.push(
        buildScalarLine("nyozePreserveEmptyParagraphs", true, "", eol),
      );
    }
  }

  for (const key of ["title", "author", "translator"] as const) {
    const nextValue = normalizePatchValue(patch[key]);
    if (nextValue === undefined) continue;

    const existingEntry = parsed.entries.get(key) ?? null;

    if (nextValue === null) {
      if (existingEntry) {
        mutations.push({
          startIndex: existingEntry.startIndex,
          endIndex: existingEntry.endIndex,
          replacement: [],
        });
      }
      continue;
    }

    if (existingEntry) {
      const replacement = buildScalarLine(
        key,
        nextValue,
        existingEntry.inlineComment,
        parsed.bodyLines[existingEntry.startIndex]?.ending || eol,
      );
      mutations.push({
        startIndex: existingEntry.startIndex,
        endIndex: existingEntry.endIndex,
        replacement: [replacement],
      });
      continue;
    }

    insertions.push(buildScalarLine(key, nextValue, "", eol));
  }

  const nextWritingMode = normalizePatchValue(patch.writingMode);
  if (nextWritingMode !== undefined) {
    const existingEntry = parsed.entries.get("writingMode") ?? null;

    if (nextWritingMode === null) {
      if (existingEntry) {
        mutations.push({
          startIndex: existingEntry.startIndex,
          endIndex: existingEntry.endIndex,
          replacement: [],
        });
      }
    } else if (existingEntry) {
      const replacement = buildScalarLine(
        "writingMode",
        nextWritingMode,
        existingEntry.inlineComment,
        parsed.bodyLines[existingEntry.startIndex]?.ending || eol,
      );
      mutations.push({
        startIndex: existingEntry.startIndex,
        endIndex: existingEntry.endIndex,
        replacement: [replacement],
      });
    } else {
      insertions.push(buildScalarLine("writingMode", nextWritingMode, "", eol));
    }
  }

  for (const mutation of mutations.sort((a, b) => b.startIndex - a.startIndex)) {
    nextBody.splice(
      mutation.startIndex,
      mutation.endIndex - mutation.startIndex + 1,
      ...mutation.replacement,
    );
  }

  nextBody.push(...insertions);

  if (nextBody.length === 0) {
    return "";
  }

  return parsed.openingLine.raw + nextBody.join("") + parsed.closingLine.raw;
}
