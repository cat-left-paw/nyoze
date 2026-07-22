/**
 * Book manifest v3 第2スライス: read-only な pure model / parser / normalizer。
 *
 * 設計の正本は `docs/book-manifest-v3-design-2026-06.md`。
 *
 * `title` / `authors` / `translators` を Project 内表示 metadata の正本にする。
 * - Book にも `authors` の canonical 規則（最大件数・要素上限）を適用する。
 *
 * このスライスの不変条件（pure 境界）:
 * - filesystem / Electron / IPC / UI / React に依存しない。
 *   `WritingMode` だけを type-only import し、path 検証 / 比較は中立 helper を再利用する。
 * - `.nyoze/books.json` を読み書きしない。入力は呼び出し側が用意した `unknown`
 *   （または JSON 文字列）だけで、ファイル I/O / writer / IPC は別レイヤが担う。
 * - frontmatter / Markdown serializer を読まない・書き換えない。
 * - version 不一致は invalid。
 * - 入力 object を mutate しない。出力は常に新しい object / 配列。
 *
 * このスライスでやること:
 * - v3 registry / book / item / material 型の定義（`label` を持たない）。
 * - `unknown` を受けて registry を normalize する pure parser
 *   （invalid / drop / warning を確定する）。
 * - title basename fallback helper（query 層でも再利用できる形）。
 */

import type { WritingMode } from "../settings/types";
import {
  bookManifestRegistryPathComparisonKey,
  normalizeBookManifestRegistryPath,
} from "./bookManifestPath";

/** v3 registry schema version。 */
export const BOOK_MANIFEST_V3_VERSION = 3 as const;

/** title / Book name の canonical 上限（UTF-16 code units）。 */
export const BOOK_MANIFEST_V3_MAX_TITLE_LENGTH = 200;

/** authors / translators の各要素の canonical 上限（UTF-16 code units）。 */
export const BOOK_MANIFEST_V3_MAX_CREDIT_LENGTH = 200;

/** authors / translators の canonical 件数上限。 */
export const BOOK_MANIFEST_V3_MAX_CREDITS = 32;

/** v3 body item の正式対象 role（初期スコープ）。 */
export const KNOWN_BOOK_MANIFEST_V3_ITEM_ROLES = ["body"] as const;
export type BookManifestV3ItemRole = (typeof KNOWN_BOOK_MANIFEST_V3_ITEM_ROLES)[number];

/** v3 Material の既知 role。 */
export const KNOWN_BOOK_MANIFEST_V3_MATERIAL_ROLES = [
  "character",
  "setting",
  "synopsis",
  "material",
  "unsorted",
] as const;
export type BookManifestV3MaterialRole =
  (typeof KNOWN_BOOK_MANIFEST_V3_MATERIAL_ROLES)[number];

/** Book 本文 item。`label` は持たない。 */
export type BookManifestV3Item = {
  id: string;
  path: string;
  role: BookManifestV3ItemRole;
  title: string;
  authors: string[];
  translators: string[];
};

/** Project 内資料。`label` は持たない。 */
export type BookManifestV3Material = {
  id: string;
  path: string;
  role: BookManifestV3MaterialRole;
  title: string;
  authors: string[];
  translators: string[];
};

/** Book 本体。`authors` は Book 全体 credit。 */
export type BookManifestV3Book = {
  id: string;
  name: string;
  authors: string[];
  language: string | null;
  writingMode: WritingMode | null;
  items: BookManifestV3Item[];
};

/** normalize 後の v3 registry。 */
export type BookManifestV3Registry = {
  version: typeof BOOK_MANIFEST_V3_VERSION;
  books: BookManifestV3Book[];
  materials: BookManifestV3Material[];
  ignored: string[];
};

/**
 * entry を drop した理由。identity（id / path / role）が壊れた entry にだけ使う。
 * metadata（title / credits）だけが壊れた entry は drop せず warning にする。
 */
export type BookManifestV3DropReason =
  | "not-object"
  | "missing-id-or-name"
  | "missing-id-or-path"
  | "invalid-path"
  | "unknown-item-role"
  | "unknown-material-role"
  | "duplicate-id"
  | "duplicate-path";

export type BookManifestV3Drop = {
  scope: "book" | "item" | "material" | "ignored";
  index: number;
  bookIndex?: number;
  reason: BookManifestV3DropReason;
};

export type BookManifestV3CreditField = "authors" | "translators";

/**
 * metadata が壊れていても entry を保持したときに添える warning。
 * - `title-fallback`: title 欠損 / 非 string / 空白のみ / 上限超過のため basename fallback。
 * - `credits-not-array`: 配列でない credits を空配列へ畳んだ。
 * - `credits-invalid-element`: 非 string / 空白のみの要素を drop した。
 * - `credits-element-too-long`: 上限超過の要素を drop した。
 * - `credits-over-limit`: 件数上限を超える後続要素を drop した。
 * - `top-level-field-invalid`: books / materials / ignored が欠損 / 非配列のため空配列にした。
 */
export type BookManifestV3Warning =
  | {
      code: "title-fallback";
      scope: "item" | "material";
      bookIndex?: number;
      index: number;
      reason: "missing" | "not-string" | "empty" | "too-long";
      fallback: string;
    }
  | {
      code: "credits-not-array";
      scope: "book" | "item" | "material";
      field: BookManifestV3CreditField;
      bookIndex?: number;
      index?: number;
    }
  | {
      code: "credits-invalid-element";
      scope: "book" | "item" | "material";
      field: BookManifestV3CreditField;
      bookIndex?: number;
      index?: number;
      elementIndex: number;
    }
  | {
      code: "credits-element-too-long";
      scope: "book" | "item" | "material";
      field: BookManifestV3CreditField;
      bookIndex?: number;
      index?: number;
      elementIndex: number;
    }
  | {
      code: "credits-over-limit";
      scope: "book" | "item" | "material";
      field: BookManifestV3CreditField;
      bookIndex?: number;
      index?: number;
      limit: number;
    }
  | {
      code: "top-level-field-invalid";
      field: "books" | "materials" | "ignored";
      reason: "missing" | "not-array";
    };

export type BookManifestV3ParseResult =
  | { kind: "absent" }
  | { kind: "invalid"; reason: string }
  | {
      kind: "ok";
      registry: BookManifestV3Registry;
      dropped: BookManifestV3Drop[];
      warnings: BookManifestV3Warning[];
    };

// ----------------------------------------------------------------
// scalar / object helpers（pure）
// ----------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 非空 scalar string のみ採用（trim して空なら無効）。採用時は raw 文字列を返す。 */
function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return value.trim().length > 0 ? value : null;
}

type CanonicalStringResult =
  | { ok: true; value: string }
  | { ok: false; reason: "not-string" | "empty" | "too-long" };

/**
 * canonical な title / credit 要素を判定する。
 * - 非 string → `not-string`
 * - trim 後に空 → `empty`
 * - trim 後の長さが上限超過 → `too-long`
 * - それ以外 → `ok`（trim 済みの canonical 値を返す。前後空白は残さない）
 *
 * path は別経路（{@link normalizeBookManifestRegistryPath}）で扱い、stored 文字列を
 * 書き換えない。この helper は title / Book name / credits 専用。
 */
function acceptCanonicalString(value: unknown, maxLength: number): CanonicalStringResult {
  if (typeof value !== "string") return { ok: false, reason: "not-string" };
  const trimmed = value.trim();
  if (trimmed.length === 0) return { ok: false, reason: "empty" };
  if (trimmed.length > maxLength) return { ok: false, reason: "too-long" };
  return { ok: true, value: trimmed };
}

// ----------------------------------------------------------------
// path / basename helpers
// ----------------------------------------------------------------

function basenameFromRelative(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, "/");
  const idx = normalized.lastIndexOf("/");
  return idx >= 0 ? normalized.slice(idx + 1) : normalized;
}

/**
 * basename から拡張子（最後の `.ext`）を除いた値。
 * 先頭ドット（dotfile）は拡張子扱いしない。除去後が空なら basename をそのまま返す。
 */
function stripFileExtension(basename: string): string {
  const dot = basename.lastIndexOf(".");
  if (dot <= 0) return basename;
  const stripped = basename.slice(0, dot);
  return stripped.length > 0 ? stripped : basename;
}

/**
 * project 相対 path から拡張子を除いた basename を返す（read-time title fallback の正本）。
 * frontmatter / filesystem を読まない。query 層でも再利用できる pure helper。
 */
export function bookManifestV3BasenameTitle(path: string): string {
  return stripFileExtension(basenameFromRelative(path));
}

/**
 * 明示 title が canonical なら採用し、無効なら basename fallback を返す（pure）。
 * 「無効」は欠損 / 非 string / 空白のみ / 上限超過。query 層でも parser と同じ判定を共有できる。
 */
export function bookManifestV3ItemTitle(
  explicitTitle: string | undefined,
  path: string,
): string {
  const accepted = acceptCanonicalString(explicitTitle, BOOK_MANIFEST_V3_MAX_TITLE_LENGTH);
  return accepted.ok ? accepted.value : bookManifestV3BasenameTitle(path);
}

// ----------------------------------------------------------------
// credit normalize
// ----------------------------------------------------------------

type CreditContext = {
  scope: "book" | "item" | "material";
  field: BookManifestV3CreditField;
  bookIndex?: number;
  index?: number;
};

/**
 * authors / translators を canonical へ正規化する（pure）。
 * - 欠損（undefined / null）→ 空配列、warning なし。
 * - 非配列 → 空配列 + warning。
 * - 各要素は trim 後非空 string かつ上限以内。無効要素・上限超過要素は drop + warning。
 * - 件数上限超過の後続要素は drop + warning。
 * - 重複 dedupe しない。順序を維持する。
 */
function normalizeCredits(
  raw: unknown,
  ctx: CreditContext,
  warnings: BookManifestV3Warning[],
): string[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    warnings.push({
      code: "credits-not-array",
      scope: ctx.scope,
      field: ctx.field,
      bookIndex: ctx.bookIndex,
      index: ctx.index,
    });
    return [];
  }

  const values: string[] = [];
  let overLimitReported = false;
  raw.forEach((element, elementIndex) => {
    const accepted = acceptCanonicalString(element, BOOK_MANIFEST_V3_MAX_CREDIT_LENGTH);
    if (!accepted.ok) {
      warnings.push({
        code: accepted.reason === "too-long" ? "credits-element-too-long" : "credits-invalid-element",
        scope: ctx.scope,
        field: ctx.field,
        bookIndex: ctx.bookIndex,
        index: ctx.index,
        elementIndex,
      });
      return;
    }
    if (values.length >= BOOK_MANIFEST_V3_MAX_CREDITS) {
      if (!overLimitReported) {
        overLimitReported = true;
        warnings.push({
          code: "credits-over-limit",
          scope: ctx.scope,
          field: ctx.field,
          bookIndex: ctx.bookIndex,
          index: ctx.index,
          limit: BOOK_MANIFEST_V3_MAX_CREDITS,
        });
      }
      return;
    }
    values.push(accepted.value);
  });
  return values;
}

// ----------------------------------------------------------------
// title normalize（fallback + warning）
// ----------------------------------------------------------------

function normalizeTitleWithFallback(
  raw: unknown,
  path: string,
  scope: "item" | "material",
  bookIndex: number | undefined,
  index: number,
  warnings: BookManifestV3Warning[],
): string {
  let reason: "missing" | "not-string" | "empty" | "too-long" | null = null;
  if (raw === undefined || raw === null) {
    reason = "missing";
  } else {
    const accepted = acceptCanonicalString(raw, BOOK_MANIFEST_V3_MAX_TITLE_LENGTH);
    if (accepted.ok) return accepted.value;
    reason = accepted.reason;
  }

  const fallback = bookManifestV3BasenameTitle(path);
  warnings.push({ code: "title-fallback", scope, bookIndex, index, reason, fallback });
  return fallback;
}

// ----------------------------------------------------------------
// role normalize
// ----------------------------------------------------------------

/**
 * item role を判定する。v3 では role は必須で `body` のみ。
 * 欠損 / null / 非 body はすべて `unknown` として drop 対象にする（absent も受理しない）。
 */
function normalizeItemRole(value: unknown): BookManifestV3ItemRole | "unknown" {
  return value === "body" ? "body" : "unknown";
}

function normalizeMaterialRole(value: unknown): BookManifestV3MaterialRole | null {
  const role = asNonEmptyString(value);
  if (role === null) return null;
  if ((KNOWN_BOOK_MANIFEST_V3_MATERIAL_ROLES as readonly string[]).includes(role)) {
    return role as BookManifestV3MaterialRole;
  }
  return null;
}

// ----------------------------------------------------------------
// entry normalize
// ----------------------------------------------------------------

function normalizeItem(
  input: unknown,
  bookIndex: number,
  itemIndex: number,
  seenItemIds: Set<string>,
  seenPaths: Set<string>,
  dropped: BookManifestV3Drop[],
  warnings: BookManifestV3Warning[],
): BookManifestV3Item | null {
  if (!isPlainObject(input)) {
    dropped.push({ scope: "item", index: itemIndex, bookIndex, reason: "not-object" });
    return null;
  }

  const id = asNonEmptyString(input.id);
  const path = normalizeBookManifestRegistryPath(input.path);
  if (id === null || path === null) {
    dropped.push({
      scope: "item",
      index: itemIndex,
      bookIndex,
      reason: path === null && id !== null ? "invalid-path" : "missing-id-or-path",
    });
    return null;
  }

  const roleState = normalizeItemRole(input.role);
  if (roleState === "unknown") {
    dropped.push({ scope: "item", index: itemIndex, bookIndex, reason: "unknown-item-role" });
    return null;
  }

  if (seenItemIds.has(id)) {
    dropped.push({ scope: "item", index: itemIndex, bookIndex, reason: "duplicate-id" });
    return null;
  }
  const pathKey = bookManifestRegistryPathComparisonKey(path);
  if (seenPaths.has(pathKey)) {
    dropped.push({ scope: "item", index: itemIndex, bookIndex, reason: "duplicate-path" });
    return null;
  }

  seenItemIds.add(id);
  seenPaths.add(pathKey);

  return {
    id,
    path,
    role: "body",
    title: normalizeTitleWithFallback(input.title, path, "item", bookIndex, itemIndex, warnings),
    authors: normalizeCredits(
      input.authors,
      { scope: "item", field: "authors", bookIndex, index: itemIndex },
      warnings,
    ),
    translators: normalizeCredits(
      input.translators,
      { scope: "item", field: "translators", bookIndex, index: itemIndex },
      warnings,
    ),
  };
}

function normalizeMaterial(
  input: unknown,
  index: number,
  seenMaterialIds: Set<string>,
  seenPaths: Set<string>,
  dropped: BookManifestV3Drop[],
  warnings: BookManifestV3Warning[],
): BookManifestV3Material | null {
  if (!isPlainObject(input)) {
    dropped.push({ scope: "material", index, reason: "not-object" });
    return null;
  }

  const id = asNonEmptyString(input.id);
  const path = normalizeBookManifestRegistryPath(input.path);
  const role = normalizeMaterialRole(input.role);
  if (id === null || path === null) {
    dropped.push({
      scope: "material",
      index,
      reason: path === null && id !== null ? "invalid-path" : "missing-id-or-path",
    });
    return null;
  }
  if (role === null) {
    dropped.push({ scope: "material", index, reason: "unknown-material-role" });
    return null;
  }

  if (seenMaterialIds.has(id)) {
    dropped.push({ scope: "material", index, reason: "duplicate-id" });
    return null;
  }
  const pathKey = bookManifestRegistryPathComparisonKey(path);
  if (seenPaths.has(pathKey)) {
    dropped.push({ scope: "material", index, reason: "duplicate-path" });
    return null;
  }

  seenMaterialIds.add(id);
  seenPaths.add(pathKey);

  return {
    id,
    path,
    role,
    title: normalizeTitleWithFallback(input.title, path, "material", undefined, index, warnings),
    authors: normalizeCredits(
      input.authors,
      { scope: "material", field: "authors", index },
      warnings,
    ),
    translators: normalizeCredits(
      input.translators,
      { scope: "material", field: "translators", index },
      warnings,
    ),
  };
}

function normalizeBook(
  input: unknown,
  index: number,
  seenBookIds: Set<string>,
  seenPaths: Set<string>,
  dropped: BookManifestV3Drop[],
  warnings: BookManifestV3Warning[],
): BookManifestV3Book | null {
  if (!isPlainObject(input)) {
    dropped.push({ scope: "book", index, reason: "not-object" });
    return null;
  }

  const id = asNonEmptyString(input.id);
  const name = acceptCanonicalString(input.name, BOOK_MANIFEST_V3_MAX_TITLE_LENGTH);
  if (id === null || !name.ok) {
    dropped.push({ scope: "book", index, reason: "missing-id-or-name" });
    return null;
  }

  if (seenBookIds.has(id)) {
    dropped.push({ scope: "book", index, reason: "duplicate-id" });
    return null;
  }
  seenBookIds.add(id);

  const authors = normalizeCredits(
    input.authors,
    { scope: "book", field: "authors", bookIndex: index },
    warnings,
  );

  const rawItems = input.items;
  const items: BookManifestV3Item[] = [];
  const seenItemIds = new Set<string>();
  if (Array.isArray(rawItems)) {
    rawItems.forEach((rawItem, itemIndex) => {
      const item = normalizeItem(
        rawItem,
        index,
        itemIndex,
        seenItemIds,
        seenPaths,
        dropped,
        warnings,
      );
      if (item !== null) items.push(item);
    });
  }

  return {
    id,
    name: name.value,
    authors,
    language: asNonEmptyString(input.language),
    writingMode: normalizeWritingMode(input.writingMode),
    items,
  };
}

function normalizeWritingMode(value: unknown): WritingMode | null {
  if (value === "vertical-rl" || value === "horizontal-tb") return value;
  return null;
}

function normalizeIgnored(
  input: unknown,
  seenPaths: Set<string>,
  dropped: BookManifestV3Drop[],
): string[] {
  if (!Array.isArray(input)) return [];
  const ignored: string[] = [];
  input.forEach((raw, index) => {
    const path = normalizeBookManifestRegistryPath(raw);
    if (path === null) {
      dropped.push({ scope: "ignored", index, reason: "invalid-path" });
      return;
    }
    const pathKey = bookManifestRegistryPathComparisonKey(path);
    if (seenPaths.has(pathKey)) {
      dropped.push({ scope: "ignored", index, reason: "duplicate-path" });
      return;
    }
    seenPaths.add(pathKey);
    ignored.push(path);
  });
  return ignored;
}

// ----------------------------------------------------------------
// top-level normalize
// ----------------------------------------------------------------

/**
 * `.nyoze/books.json` v3 想定の `unknown` を normalize する（pure）。
 *
 * 方針:
 * - null / undefined → absent
 * - 非 object / version !== 3 → invalid
 * - books / materials / ignored 欠損・非配列 → 空配列 + warning
 * - identity（id / path / role）が壊れた entry は drop
 * - metadata（title / credits）だけが壊れた entry は drop せず warning
 * - duplicate book.id / item.id（所属 Book 内） / material.id は各スコープ内で先勝ち
 * - duplicate path は registry 全体（items + materials + ignored）で先勝ち
 * - 入力 object を mutate しない / unknown field は無視する
 */
export function normalizeBookManifestV3(input: unknown): BookManifestV3ParseResult {
  if (input === null || input === undefined) return { kind: "absent" };
  if (!isPlainObject(input)) return { kind: "invalid", reason: "not-object" };
  if (input.version !== BOOK_MANIFEST_V3_VERSION) {
    return { kind: "invalid", reason: "unsupported-version" };
  }

  const dropped: BookManifestV3Drop[] = [];
  const warnings: BookManifestV3Warning[] = [];
  const seenBookIds = new Set<string>();
  const seenPaths = new Set<string>();
  const books: BookManifestV3Book[] = [];

  const rawBooks = input.books;
  if (Array.isArray(rawBooks)) {
    rawBooks.forEach((rawBook, index) => {
      const book = normalizeBook(rawBook, index, seenBookIds, seenPaths, dropped, warnings);
      if (book !== null) books.push(book);
    });
  } else {
    warnings.push({
      code: "top-level-field-invalid",
      field: "books",
      reason: rawBooks === undefined ? "missing" : "not-array",
    });
  }

  const materials: BookManifestV3Material[] = [];
  const seenMaterialIds = new Set<string>();
  const rawMaterials = input.materials;
  if (Array.isArray(rawMaterials)) {
    rawMaterials.forEach((rawMaterial, index) => {
      const material = normalizeMaterial(
        rawMaterial,
        index,
        seenMaterialIds,
        seenPaths,
        dropped,
        warnings,
      );
      if (material !== null) materials.push(material);
    });
  } else {
    warnings.push({
      code: "top-level-field-invalid",
      field: "materials",
      reason: rawMaterials === undefined ? "missing" : "not-array",
    });
  }

  const rawIgnored = input.ignored;
  const ignored = normalizeIgnored(rawIgnored, seenPaths, dropped);
  if (!Array.isArray(rawIgnored)) {
    warnings.push({
      code: "top-level-field-invalid",
      field: "ignored",
      reason: rawIgnored === undefined ? "missing" : "not-array",
    });
  }

  return {
    kind: "ok",
    registry: {
      version: BOOK_MANIFEST_V3_VERSION,
      books,
      materials,
      ignored,
    },
    dropped,
    warnings,
  };
}

/** JSON 文字列から v3 registry を normalize する thin wrapper（pure）。 */
export function parseBookManifestV3Json(raw: string): BookManifestV3ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { kind: "invalid", reason: "json-parse-error" };
  }
  return normalizeBookManifestV3(parsed);
}
