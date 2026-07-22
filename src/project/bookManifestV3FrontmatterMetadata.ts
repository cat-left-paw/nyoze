/**
 * Book manifest v3: frontmatter 由来 metadata の pure 解決 helper。
 *
 * 新規登録時にだけ使う title / credits の初期化規則。
 * filesystem / frontmatter parser には依存しない。
 */

import {
  BOOK_MANIFEST_V3_MAX_CREDITS,
  BOOK_MANIFEST_V3_MAX_CREDIT_LENGTH,
  BOOK_MANIFEST_V3_MAX_TITLE_LENGTH,
  bookManifestV3BasenameTitle,
} from "./bookManifestV3";

/** frontmatter parser 出力相当の field（main が read-only で用意する）。 */
export type BookManifestV3FrontmatterFields = {
  title?: unknown;
  author?: unknown;
  coAuthors?: unknown;
  translator?: unknown;
  coTranslators?: unknown;
};

/**
 * 簡易 frontmatter parser が complex YAML を通常文字列として返したときの検出。
 * **非引用** scalar 専用。引用 scalar は {@link extractSafeScalarFromRaw} で別扱い。
 */
export function isUnsafeUnquotedScalarYaml(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) return true;
  if (/^[|>][-+]?(?:\d+)?$/.test(trimmed)) return true;
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) return true;
  if (trimmed.startsWith("&") || trimmed.startsWith("*")) return true;
  return false;
}

/** @deprecated 後方互換。非引用判定のみ。新規 code は raw 抽出を使う。 */
export function isUnsafeSimpleParserScalarString(value: string): boolean {
  return isUnsafeUnquotedScalarYaml(value);
}

type QuotedDecodeResult = { ok: true; value: string } | { ok: false };

function decodeDoubleQuotedScalar(inner: string): QuotedDecodeResult {
  let out = "";
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]!;
    if (ch === "\\") {
      const next = inner[i + 1];
      if (next === undefined) return { ok: false };
      if (next === '"') {
        out += '"';
        i += 1;
        continue;
      }
      if (next === "\\") {
        out += "\\";
        i += 1;
        continue;
      }
      if (next === "n") {
        out += "\n";
        i += 1;
        continue;
      }
      if (next === "t") {
        out += "\t";
        i += 1;
        continue;
      }
      if (next === "r") {
        out += "\r";
        i += 1;
        continue;
      }
      if (next === "u") {
        const hex = inner.slice(i + 2, i + 6);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) return { ok: false };
        out += String.fromCharCode(Number.parseInt(hex, 16));
        i += 5;
        continue;
      }
      return { ok: false };
    }
    out += ch;
  }
  return { ok: true, value: out };
}

function decodeSingleQuotedScalar(inner: string): QuotedDecodeResult {
  let out = "";
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]!;
    if (ch === "'") {
      if (inner[i + 1] === "'") {
        out += "'";
        i += 1;
        continue;
      }
      return { ok: false };
    }
    out += ch;
  }
  return { ok: true, value: out };
}

function isWellFormedQuotedScalar(s: string): boolean {
  if (s.length < 2) return false;
  if (s.startsWith('"')) {
    for (let i = 1; i < s.length; i++) {
      const ch = s[i]!;
      if (ch === "\\") {
        if (i + 1 >= s.length) return false;
        i += 1;
        continue;
      }
      if (ch === '"') return i === s.length - 1;
    }
    return false;
  }
  if (s.startsWith("'")) {
    for (let i = 1; i < s.length; i++) {
      const ch = s[i]!;
      if (ch === "'") {
        if (i + 1 < s.length && s[i + 1] === "'") {
          i += 1;
          continue;
        }
        return i === s.length - 1;
      }
    }
    return false;
  }
  return false;
}

function looksLikeQuotedScalarAttempt(s: string): boolean {
  return s.startsWith('"') || s.startsWith("'");
}

function findClosingDoubleQuote(s: string, openIndex: number): number | null {
  for (let i = openIndex + 1; i < s.length; i++) {
    const ch = s[i]!;
    if (ch === "\\") {
      if (i + 1 >= s.length) return null;
      i += 1;
      continue;
    }
    if (ch === '"') return i;
  }
  return null;
}

function findClosingSingleQuote(s: string, openIndex: number): number | null {
  for (let i = openIndex + 1; i < s.length; i++) {
    const ch = s[i]!;
    if (ch === "'") {
      if (i + 1 < s.length && s[i + 1] === "'") {
        i += 1;
        continue;
      }
      return i;
    }
  }
  return null;
}

/**
 * YAML 引用 scalar を復号する（double-quote escape / single-quote `''` / `\uXXXX`）。
 * 不正・未対応 escape は undefined を返す。
 */
export function decodeQuotedScalar(s: string): string | undefined {
  if (!isWellFormedQuotedScalar(s)) return undefined;
  const inner = s.slice(1, -1);
  const decoded = s.startsWith('"') ? decodeDoubleQuotedScalar(inner) : decodeSingleQuotedScalar(inner);
  if (!decoded.ok || decoded.value.length === 0) return undefined;
  return decoded.value;
}

function isQuotedScalar(s: string): boolean {
  return isWellFormedQuotedScalar(s);
}

function stripInlineComment(s: string): string {
  let inSingle = false;
  let inDouble = false;
  let escaped = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inDouble) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inDouble = false;
      continue;
    }
    if (inSingle) {
      if (ch === "'") inSingle = false;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      continue;
    }
    if (ch === "#" && (i === 0 || /\s/.test(s[i - 1]!))) {
      return s.slice(0, i).trimEnd();
    }
  }

  return s;
}

function isUnquotedMappingLikeScalar(inline: string): boolean {
  if (isQuotedScalar(inline)) return false;
  return inline.includes(": ");
}

/**
 * raw frontmatter の scalar 断片（`:` 以降・trim 前）から安全な文字列を抽出する。
 * 引用 scalar は complex 記法を含んでも採用する。非引用は complex YAML を拒否する。
 */
export function extractSafeScalarFromRaw(raw: string): string | undefined {
  const inline = stripInlineComment(raw.trim());
  if (!inline) return undefined;
  if (looksLikeQuotedScalarAttempt(inline)) {
    return decodeQuotedScalar(inline);
  }
  if (isUnsafeUnquotedScalarYaml(inline)) return undefined;
  if (isUnquotedMappingLikeScalar(inline)) return undefined;
  return inline;
}

function splitFlowItemsRespectingNesting(inner: string): string[] | null {
  const items: string[] = [];
  let current = "";
  let bracketDepth = 0;
  let braceDepth = 0;

  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]!;
    if (ch === '"') {
      const close = findClosingDoubleQuote(inner, i);
      if (close === null) return null;
      current += inner.slice(i, close + 1);
      i = close;
      continue;
    }
    if (ch === "'") {
      const close = findClosingSingleQuote(inner, i);
      if (close === null) return null;
      current += inner.slice(i, close + 1);
      i = close;
      continue;
    }
    if (ch === "[") {
      bracketDepth += 1;
      current += ch;
      continue;
    }
    if (ch === "]") {
      if (bracketDepth > 0) bracketDepth -= 1;
      current += ch;
      continue;
    }
    if (ch === "{") {
      braceDepth += 1;
      current += ch;
      continue;
    }
    if (ch === "}") {
      if (braceDepth > 0) braceDepth -= 1;
      current += ch;
      continue;
    }
    if (ch === "," && bracketDepth === 0 && braceDepth === 0) {
      items.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  items.push(current);
  return items;
}

function extractSafeScalarsFromDelimitedList(inner: string): string[] | undefined {
  const split = splitFlowItemsRespectingNesting(inner);
  if (split === null) return undefined;
  const items = split
    .map((part) => extractSafeScalarFromRaw(part.trim()))
    .filter((value): value is string => value !== undefined);
  return items.length > 0 ? items : undefined;
}

function extractSafeListFromRaw(raw: string, remainingLines: readonly string[]): string[] | undefined {
  const inline = stripInlineComment(raw.trim());

  if (isQuotedScalar(inline)) {
    const value = decodeQuotedScalar(inline);
    return value === undefined ? undefined : [value];
  }

  if (inline.startsWith("[") && inline.endsWith("]")) {
    const inner = inline.slice(1, -1);
    if (!inner.trim()) return [];
    return extractSafeScalarsFromDelimitedList(inner);
  }

  if (inline.startsWith("{")) {
    return undefined;
  }

  if (!inline) {
    const items: string[] = [];
    for (const nextLine of remainingLines) {
      if (nextLine.length > 0 && !/^\s/.test(nextLine)) break;
      const trimmed = nextLine.trimStart();
      if (trimmed.startsWith("- ")) {
        const value = extractSafeScalarFromRaw(trimmed.slice(2));
        if (value !== undefined) items.push(value);
      } else if (trimmed === "-") {
        // bare dash — skip
      } else if (trimmed.length === 0) {
        continue;
      } else {
        break;
      }
    }
    return items.length > 0 ? items : undefined;
  }

  if (inline.includes(",")) {
    return extractSafeScalarsFromDelimitedList(inline);
  }

  const scalar = extractSafeScalarFromRaw(inline);
  return scalar === undefined ? undefined : [scalar];
}

function frontmatterBodyLines(frontmatterPrefix: string): string[] {
  return frontmatterPrefix.split("\n").filter((line) => !/^---[ \t]*$/.test(line));
}

const V3_SCALAR_KEYS = new Set(["title", "author", "translator"]);
const V3_LIST_KEYS = new Set(["co_authors", "co_translators"]);

function parseTopLevelFrontmatterEntry(line: string): { key: string; raw: string } | null {
  if (/^\s/.test(line)) return null;
  const colonIdx = line.indexOf(":");
  if (colonIdx < 1) return null;
  const key = line.slice(0, colonIdx).trim();
  if (key.length === 0) return null;
  return { key, raw: line.slice(colonIdx + 1) };
}

/**
 * raw frontmatter prefix から v3 metadata 用 field を安全に抽出する。
 * 引用状態を保持したまま complex YAML と quoted scalar を区別する。
 * 対象 key はトップレベル行のみ。block list 要素は scalar のみ採用する。
 */
export function extractV3FrontmatterMetadataFields(
  frontmatterPrefix: string,
): BookManifestV3FrontmatterFields {
  const fields: BookManifestV3FrontmatterFields = {};
  const lines = frontmatterBodyLines(frontmatterPrefix);

  for (let i = 0; i < lines.length; i++) {
    const entry = parseTopLevelFrontmatterEntry(lines[i]!);
    if (entry === null) continue;
    const { key, raw } = entry;

    if (V3_SCALAR_KEYS.has(key)) {
      const value = extractSafeScalarFromRaw(raw);
      if (value === undefined) continue;
      if (key === "title") fields.title = value;
      else if (key === "author") fields.author = value;
      else if (key === "translator") fields.translator = value;
    } else if (V3_LIST_KEYS.has(key)) {
      const list = extractSafeListFromRaw(raw, lines.slice(i + 1));
      if (list === undefined || list.length === 0) continue;
      if (key === "co_authors") fields.coAuthors = list;
      else fields.coTranslators = list;
    }
  }

  return fields;
}

function sanitizeScalarFromParser(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (isUnsafeUnquotedScalarYaml(value)) return undefined;
  return value;
}

function sanitizeListFromParser(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const out: string[] = [];
    for (const element of value) {
      if (typeof element !== "string") continue;
      if (isUnsafeUnquotedScalarYaml(element)) continue;
      out.push(element);
    }
    return out.length > 0 ? out : undefined;
  }
  const scalar = sanitizeScalarFromParser(value);
  return scalar === undefined ? undefined : [scalar];
}

/**
 * `parseFrontmatterFields` 由来の field から、v3 metadata 採用に安全な scalar / list だけ残す。
 * @deprecated 引用 scalar を区別できない。{@link extractV3FrontmatterMetadataFields} を使う。
 */
export function sanitizeV3FrontmatterFieldsFromParser(
  fields: BookManifestV3FrontmatterFields,
): BookManifestV3FrontmatterFields {
  const sanitized: BookManifestV3FrontmatterFields = {};
  const title = sanitizeScalarFromParser(fields.title);
  if (title !== undefined) sanitized.title = title;
  const author = sanitizeScalarFromParser(fields.author);
  if (author !== undefined) sanitized.author = author;
  const translator = sanitizeScalarFromParser(fields.translator);
  if (translator !== undefined) sanitized.translator = translator;
  const coAuthors = sanitizeListFromParser(fields.coAuthors);
  if (coAuthors !== undefined) sanitized.coAuthors = coAuthors;
  const coTranslators = sanitizeListFromParser(fields.coTranslators);
  if (coTranslators !== undefined) sanitized.coTranslators = coTranslators;
  return sanitized;
}

export type CanonicalCheck =
  | { ok: true; value: string }
  | { ok: false; reason: "not-string" | "empty" | "too-long" };

/**
 * canonical 文字列の判定。v3 parser / writer と同じ意味論。
 */
export function checkCanonicalV3String(value: unknown, maxLength: number): CanonicalCheck {
  if (typeof value !== "string") return { ok: false, reason: "not-string" };
  const trimmed = value.trim();
  if (trimmed.length === 0) return { ok: false, reason: "empty" };
  if (trimmed.length > maxLength) return { ok: false, reason: "too-long" };
  return { ok: true, value: trimmed };
}

export type V3CreditsWarningCode =
  | "invalid-author"
  | "invalid-co-author"
  | "invalid-translator"
  | "invalid-co-translator"
  | "credits-over-limit";

/**
 * scalar → list の順で credit を連結する（trim・200字・32件・非 dedupe）。
 * invalid 要素ごとに warning を返せる。登録側では warning を省略してよい。
 */
export function resolveV3CreditsFromFrontmatter(
  scalar: unknown,
  list: unknown,
  options?: {
    onWarning?: (code: V3CreditsWarningCode) => void;
    scalarCode?: V3CreditsWarningCode;
    listCode?: V3CreditsWarningCode;
  },
): string[] {
  const onWarning = options?.onWarning;
  const scalarCode = options?.scalarCode ?? "invalid-author";
  const listCode = options?.listCode ?? "invalid-co-author";
  const out: string[] = [];
  let overLimitWarned = false;

  const tryAdd = (value: string): void => {
    if (out.length >= BOOK_MANIFEST_V3_MAX_CREDITS) {
      if (!overLimitWarned) {
        overLimitWarned = true;
        onWarning?.("credits-over-limit");
      }
      return;
    }
    out.push(value);
  };

  if (scalar !== undefined) {
    const check = checkCanonicalV3String(scalar, BOOK_MANIFEST_V3_MAX_CREDIT_LENGTH);
    if (check.ok) tryAdd(check.value);
    else onWarning?.(scalarCode);
  }

  if (list !== undefined) {
    if (Array.isArray(list)) {
      for (const element of list) {
        const check = checkCanonicalV3String(element, BOOK_MANIFEST_V3_MAX_CREDIT_LENGTH);
        if (check.ok) tryAdd(check.value);
        else onWarning?.(listCode);
      }
    } else {
      onWarning?.(listCode);
    }
  }

  return out;
}

export type ResolveV3TitleResult =
  | { ok: true; title: string; usedBasename: boolean }
  | { ok: false; reason: "invalid-title"; detail: string };

/**
 * frontmatter title（有効なら採用）→ basename fallback。
 * basename も canonical 不可なら拒否（切り詰めない）。
 */
export function resolveV3TitleFromFrontmatterOrBasename(
  path: string,
  frontmatterTitle?: unknown,
): ResolveV3TitleResult {
  if (frontmatterTitle !== undefined) {
    const titleCheck = checkCanonicalV3String(frontmatterTitle, BOOK_MANIFEST_V3_MAX_TITLE_LENGTH);
    if (titleCheck.ok) {
      return { ok: true, title: titleCheck.value, usedBasename: false };
    }
  }

  const basenameCheck = checkCanonicalV3String(
    bookManifestV3BasenameTitle(path),
    BOOK_MANIFEST_V3_MAX_TITLE_LENGTH,
  );
  if (!basenameCheck.ok) {
    return { ok: false, reason: "invalid-title", detail: `basename:${basenameCheck.reason}` };
  }
  return { ok: true, title: basenameCheck.value, usedBasename: true };
}

export type ResolveV3RegistrationMetadataResult =
  | { ok: true; title: string; authors: string[]; translators: string[] }
  | { ok: false; reason: "invalid-title"; detail: string };

/**
 * 新規登録用: frontmatter fields から v3 entry metadata を決める（label なし）。
 * invalid FM 要素は黙って drop する（warning なし）。
 */
export function resolveV3RegistrationMetadata(
  path: string,
  fields: BookManifestV3FrontmatterFields,
): ResolveV3RegistrationMetadataResult {
  const titleResult = resolveV3TitleFromFrontmatterOrBasename(path, fields.title);
  if (!titleResult.ok) return titleResult;

  const authors = resolveV3CreditsFromFrontmatter(fields.author, fields.coAuthors, {
    scalarCode: "invalid-author",
    listCode: "invalid-co-author",
  });
  const translators = resolveV3CreditsFromFrontmatter(fields.translator, fields.coTranslators, {
    scalarCode: "invalid-translator",
    listCode: "invalid-co-translator",
  });

  return {
    ok: true,
    title: titleResult.title,
    authors,
    translators,
  };
}
