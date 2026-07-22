/**
 * Book manifest v3 writer 基盤: registry を更新する pure helper 群。
 *
 * 設計の正本は `docs/book-manifest-v3-design-2026-06.md`。
 *
 * このスライスの不変条件:
 * - filesystem / Electron / IPC / UI / React に依存しない。
 * - Markdown / frontmatter / project.json / notes.json は変更しない。
 * - 入力 registry を mutate しない。失敗時は部分更新しない。
 * - v3 registry だけを扱う。
 * - `label` field は持たない / 扱わない。
 * - 更新後 registry は `normalizeBookManifestV3` で drop / warning ゼロの canonical 値であること。
 */

import type { WritingMode } from "../settings/types";
import {
  bookManifestRegistryPathComparisonKey,
  normalizeBookManifestRegistryPath,
} from "./bookManifestPath";
import {
  BOOK_MANIFEST_V3_MAX_CREDITS,
  BOOK_MANIFEST_V3_MAX_CREDIT_LENGTH,
  BOOK_MANIFEST_V3_MAX_TITLE_LENGTH,
  BOOK_MANIFEST_V3_VERSION,
  KNOWN_BOOK_MANIFEST_V3_MATERIAL_ROLES,
  normalizeBookManifestV3,
  type BookManifestV3Book,
  type BookManifestV3Item,
  type BookManifestV3Material,
  type BookManifestV3MaterialRole,
  type BookManifestV3Registry,
} from "./bookManifestV3";

// ----------------------------------------------------------------
// 共通 helpers
// ----------------------------------------------------------------

export type BookManifestV3WriterFailureReason =
  | "invalid-input"
  | "invalid-path"
  | "invalid-role"
  | "duplicate-path"
  | "duplicate-id"
  | "missing-book"
  | "missing-item"
  | "missing-material"
  | "book-not-empty"
  | "invalid-index";

type CanonicalStringResult =
  | { ok: true; value: string }
  | { ok: false; reason: "not-string" | "empty" | "too-long" };

function acceptCanonicalString(value: unknown, maxLength: number): CanonicalStringResult {
  if (typeof value !== "string") return { ok: false, reason: "not-string" };
  const trimmed = value.trim();
  if (trimmed.length === 0) return { ok: false, reason: "empty" };
  if (trimmed.length > maxLength) return { ok: false, reason: "too-long" };
  return { ok: true, value: trimmed };
}

function asNonEmptyId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return value.trim().length > 0 ? value : null;
}

function asWritingMode(value: unknown): WritingMode | null {
  if (value === "vertical-rl" || value === "horizontal-tb") return value;
  return null;
}

/**
 * canonical credits 配列を検証する。
 * - undefined → 空配列
 * - 非配列 → invalid-input
 * - 各要素 trim 後非空・上限以内、最大 32 件、dedupe しない
 */
function parseCanonicalCredits(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const result: string[] = [];
  for (const element of value) {
    const accepted = acceptCanonicalString(element, BOOK_MANIFEST_V3_MAX_CREDIT_LENGTH);
    if (!accepted.ok) return null;
    if (result.length >= BOOK_MANIFEST_V3_MAX_CREDITS) return null;
    result.push(accepted.value);
  }
  return result;
}

function collectAllRegistryPathKeys(registry: BookManifestV3Registry): Set<string> {
  const paths = new Set<string>();
  for (const book of registry.books) {
    for (const item of book.items) {
      paths.add(bookManifestRegistryPathComparisonKey(item.path));
    }
  }
  for (const material of registry.materials) {
    paths.add(bookManifestRegistryPathComparisonKey(material.path));
  }
  for (const ignored of registry.ignored) {
    paths.add(bookManifestRegistryPathComparisonKey(ignored));
  }
  return paths;
}

function collectAllBookIds(registry: BookManifestV3Registry): Set<string> {
  const ids = new Set<string>();
  for (const book of registry.books) ids.add(book.id);
  return ids;
}

function collectAllMaterialIds(registry: BookManifestV3Registry): Set<string> {
  const ids = new Set<string>();
  for (const material of registry.materials) ids.add(material.id);
  return ids;
}

function collectItemIdsInBook(book: BookManifestV3Book): Set<string> {
  const ids = new Set<string>();
  for (const item of book.items) ids.add(item.id);
  return ids;
}

function resolveUniqueId(
  taken: ReadonlySet<string>,
  makeId: (taken: ReadonlySet<string>) => string,
  maxAttempts: number,
): string | null {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidate = makeId(taken);
    if (typeof candidate !== "string" || candidate.length === 0) return null;
    if (!taken.has(candidate)) return candidate;
  }
  return null;
}

function cloneRegistry(registry: BookManifestV3Registry): BookManifestV3Registry {
  return {
    version: BOOK_MANIFEST_V3_VERSION,
    books: registry.books.map((book) => ({
      ...book,
      authors: [...book.authors],
      items: book.items.map((item) => ({
        ...item,
        authors: [...item.authors],
        translators: [...item.translators],
      })),
    })),
    materials: registry.materials.map((material) => ({
      ...material,
      authors: [...material.authors],
      translators: [...material.translators],
    })),
    ignored: [...registry.ignored],
  };
}

function asKnownMaterialRole(value: unknown): BookManifestV3MaterialRole | null {
  if (typeof value !== "string") return null;
  if ((KNOWN_BOOK_MANIFEST_V3_MATERIAL_ROLES as readonly string[]).includes(value)) {
    return value as BookManifestV3MaterialRole;
  }
  return null;
}

/** 更新後 registry が v3 canonical（drop / warning ゼロ）か検証する。 */
function assertCanonicalRegistry(
  registry: BookManifestV3Registry,
): { ok: true } | { ok: false; reason: "invalid-input" } {
  const check = normalizeBookManifestV3(registry);
  if (check.kind !== "ok" || check.dropped.length > 0 || check.warnings.length > 0) {
    return { ok: false, reason: "invalid-input" };
  }
  return { ok: true };
}

function successResult<T extends { ok: true; registry: BookManifestV3Registry }>(
  result: T,
): T | { ok: false; reason: "invalid-input" } {
  const canonical = assertCanonicalRegistry(result.registry);
  if (!canonical.ok) return canonical;
  return result;
}

function creditsEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// ----------------------------------------------------------------
// 空 registry
// ----------------------------------------------------------------

export function createEmptyBookManifestV3Registry(): BookManifestV3Registry {
  return {
    version: BOOK_MANIFEST_V3_VERSION,
    books: [],
    materials: [],
    ignored: [],
  };
}

// ----------------------------------------------------------------
// create book
// ----------------------------------------------------------------

export type CreateBookInV3RegistryInput = {
  name: string;
  authors?: string[];
  language?: string | null;
  writingMode?: WritingMode | null;
};

export type CreateBookInV3RegistryResult =
  | { ok: true; registry: BookManifestV3Registry; book: BookManifestV3Book }
  | { ok: false; reason: "invalid-input" | "duplicate-id" };

export function createBookInV3Registry(
  registry: BookManifestV3Registry,
  input: CreateBookInV3RegistryInput,
  makeId: (taken: ReadonlySet<string>) => string,
  options?: { maxIdAttempts?: number },
): CreateBookInV3RegistryResult {
  const nameCheck = acceptCanonicalString(input.name, BOOK_MANIFEST_V3_MAX_TITLE_LENGTH);
  if (!nameCheck.ok) return { ok: false, reason: "invalid-input" };

  const authors = parseCanonicalCredits(input.authors);
  if (authors === null) return { ok: false, reason: "invalid-input" };

  let language: string | null = null;
  if (input.language !== undefined && input.language !== null) {
    const langCheck = acceptCanonicalString(input.language, BOOK_MANIFEST_V3_MAX_TITLE_LENGTH);
    if (!langCheck.ok) return { ok: false, reason: "invalid-input" };
    language = langCheck.value;
  }

  const writingMode =
    input.writingMode === undefined || input.writingMode === null
      ? null
      : asWritingMode(input.writingMode);
  if (
    input.writingMode !== undefined &&
    input.writingMode !== null &&
    writingMode === null
  ) {
    return { ok: false, reason: "invalid-input" };
  }

  const takenIds = collectAllBookIds(registry);
  const id = resolveUniqueId(takenIds, makeId, options?.maxIdAttempts ?? 8);
  if (id === null) return { ok: false, reason: "duplicate-id" };

  const book: BookManifestV3Book = {
    id,
    name: nameCheck.value,
    authors,
    language,
    writingMode,
    items: [],
  };

  const next = cloneRegistry(registry);
  next.books.push({
    ...book,
    authors: [...book.authors],
    items: [],
  });
  return successResult({ ok: true as const, registry: next, book });
}

// ----------------------------------------------------------------
// update book
// ----------------------------------------------------------------

export type UpdateBookInV3RegistryChanges = {
  name?: string;
  authors?: string[];
  language?: string | null;
  writingMode?: WritingMode | null;
};

export type UpdateBookInV3RegistryResult =
  | { ok: true; registry: BookManifestV3Registry; book: BookManifestV3Book }
  | { ok: false; reason: "invalid-input" | "missing-book" };

export function updateBookInV3Registry(
  registry: BookManifestV3Registry,
  bookId: string,
  changes: UpdateBookInV3RegistryChanges,
): UpdateBookInV3RegistryResult {
  const bid = asNonEmptyId(bookId);
  if (bid === null) return { ok: false, reason: "invalid-input" };

  const bookIndex = registry.books.findIndex((book) => book.id === bid);
  if (bookIndex < 0) return { ok: false, reason: "missing-book" };

  const current = registry.books[bookIndex];
  let hasChange = false;

  let nextName = current.name;
  if (changes.name !== undefined) {
    const nameCheck = acceptCanonicalString(changes.name, BOOK_MANIFEST_V3_MAX_TITLE_LENGTH);
    if (!nameCheck.ok) return { ok: false, reason: "invalid-input" };
    if (nameCheck.value !== current.name) hasChange = true;
    nextName = nameCheck.value;
  }

  let nextAuthors = current.authors;
  if (changes.authors !== undefined) {
    const authors = parseCanonicalCredits(changes.authors);
    if (authors === null) return { ok: false, reason: "invalid-input" };
    if (!creditsEqual(authors, current.authors)) hasChange = true;
    nextAuthors = authors;
  }

  let nextLanguage = current.language;
  if (changes.language !== undefined) {
    if (changes.language === null) {
      if (current.language !== null) hasChange = true;
      nextLanguage = null;
    } else {
      const langCheck = acceptCanonicalString(changes.language, BOOK_MANIFEST_V3_MAX_TITLE_LENGTH);
      if (!langCheck.ok) return { ok: false, reason: "invalid-input" };
      if (langCheck.value !== current.language) hasChange = true;
      nextLanguage = langCheck.value;
    }
  }

  let nextWritingMode = current.writingMode;
  if (changes.writingMode !== undefined) {
    const wm = changes.writingMode === null ? null : asWritingMode(changes.writingMode);
    if (changes.writingMode !== null && wm === null) return { ok: false, reason: "invalid-input" };
    if (wm !== current.writingMode) hasChange = true;
    nextWritingMode = wm;
  }

  if (!hasChange) return { ok: false, reason: "invalid-input" };

  const next = cloneRegistry(registry);
  next.books[bookIndex] = {
    ...next.books[bookIndex],
    name: nextName,
    authors: [...nextAuthors],
    language: nextLanguage,
    writingMode: nextWritingMode,
  };
  return successResult({ ok: true as const, registry: next, book: next.books[bookIndex] });
}

// ----------------------------------------------------------------
// remove book
// ----------------------------------------------------------------

export type RemoveBookFromV3RegistryResult =
  | { ok: true; registry: BookManifestV3Registry }
  | { ok: false; reason: "invalid-input" | "missing-book" | "book-not-empty" };

export function removeBookFromV3Registry(
  registry: BookManifestV3Registry,
  bookId: string,
): RemoveBookFromV3RegistryResult {
  const bid = asNonEmptyId(bookId);
  if (bid === null) return { ok: false, reason: "invalid-input" };

  const bookIndex = registry.books.findIndex((book) => book.id === bid);
  if (bookIndex < 0) return { ok: false, reason: "missing-book" };
  if (registry.books[bookIndex].items.length > 0) {
    return { ok: false, reason: "book-not-empty" };
  }

  const next = cloneRegistry(registry);
  next.books.splice(bookIndex, 1);
  return successResult({ ok: true as const, registry: next });
}

// ----------------------------------------------------------------
// add body item
// ----------------------------------------------------------------

export type AddBodyItemToV3RegistryInput = {
  path: string;
  title: string;
  authors: string[];
  translators: string[];
};

export type AddBodyItemToV3RegistryResult =
  | { ok: true; registry: BookManifestV3Registry; item: BookManifestV3Item }
  | {
      ok: false;
      reason:
        | "invalid-input"
        | "invalid-path"
        | "missing-book"
        | "duplicate-path"
        | "duplicate-id";
    };

export function addBodyItemToV3Registry(
  registry: BookManifestV3Registry,
  bookId: string,
  input: AddBodyItemToV3RegistryInput,
  makeId: (taken: ReadonlySet<string>) => string,
  options?: { maxIdAttempts?: number },
): AddBodyItemToV3RegistryResult {
  const bid = asNonEmptyId(bookId);
  if (bid === null) return { ok: false, reason: "invalid-input" };

  const titleCheck = acceptCanonicalString(input.title, BOOK_MANIFEST_V3_MAX_TITLE_LENGTH);
  if (!titleCheck.ok) return { ok: false, reason: "invalid-input" };

  const authors = parseCanonicalCredits(input.authors);
  if (authors === null) return { ok: false, reason: "invalid-input" };
  const translators = parseCanonicalCredits(input.translators);
  if (translators === null) return { ok: false, reason: "invalid-input" };

  const normalizedPath = normalizeBookManifestRegistryPath(input.path);
  if (normalizedPath === null) return { ok: false, reason: "invalid-path" };

  const bookIndex = registry.books.findIndex((book) => book.id === bid);
  if (bookIndex < 0) return { ok: false, reason: "missing-book" };

  if (
    collectAllRegistryPathKeys(registry).has(
      bookManifestRegistryPathComparisonKey(normalizedPath),
    )
  ) {
    return { ok: false, reason: "duplicate-path" };
  }

  const takenItemIds = collectItemIdsInBook(registry.books[bookIndex]);
  const itemId = resolveUniqueId(takenItemIds, makeId, options?.maxIdAttempts ?? 8);
  if (itemId === null) return { ok: false, reason: "duplicate-id" };

  const item: BookManifestV3Item = {
    id: itemId,
    path: normalizedPath,
    role: "body",
    title: titleCheck.value,
    authors,
    translators,
  };

  const next = cloneRegistry(registry);
  next.books[bookIndex].items.push({ ...item, authors: [...authors], translators: [...translators] });
  return successResult({ ok: true as const, registry: next, item });
}

// ----------------------------------------------------------------
// update body item metadata
// ----------------------------------------------------------------

export type UpdateBodyItemMetadataChanges = {
  title?: string;
  authors?: string[];
  translators?: string[];
};

export type UpdateBodyItemMetadataResult =
  | { ok: true; registry: BookManifestV3Registry; item: BookManifestV3Item }
  | { ok: false; reason: "invalid-input" | "missing-book" | "missing-item" };

export function updateBodyItemMetadataInV3Registry(
  registry: BookManifestV3Registry,
  bookId: string,
  itemId: string,
  changes: UpdateBodyItemMetadataChanges,
): UpdateBodyItemMetadataResult {
  const bid = asNonEmptyId(bookId);
  const iid = asNonEmptyId(itemId);
  if (bid === null || iid === null) return { ok: false, reason: "invalid-input" };

  const bookIndex = registry.books.findIndex((book) => book.id === bid);
  if (bookIndex < 0) return { ok: false, reason: "missing-book" };
  const itemIndex = registry.books[bookIndex].items.findIndex((item) => item.id === iid);
  if (itemIndex < 0) return { ok: false, reason: "missing-item" };

  const current = registry.books[bookIndex].items[itemIndex];
  let hasChange = false;

  let nextTitle = current.title;
  if (changes.title !== undefined) {
    const titleCheck = acceptCanonicalString(changes.title, BOOK_MANIFEST_V3_MAX_TITLE_LENGTH);
    if (!titleCheck.ok) return { ok: false, reason: "invalid-input" };
    if (titleCheck.value !== current.title) hasChange = true;
    nextTitle = titleCheck.value;
  }

  let nextAuthors = current.authors;
  if (changes.authors !== undefined) {
    const authors = parseCanonicalCredits(changes.authors);
    if (authors === null) return { ok: false, reason: "invalid-input" };
    if (!creditsEqual(authors, current.authors)) hasChange = true;
    nextAuthors = authors;
  }

  let nextTranslators = current.translators;
  if (changes.translators !== undefined) {
    const translators = parseCanonicalCredits(changes.translators);
    if (translators === null) return { ok: false, reason: "invalid-input" };
    if (!creditsEqual(translators, current.translators)) hasChange = true;
    nextTranslators = translators;
  }

  if (!hasChange) return { ok: false, reason: "invalid-input" };

  const next = cloneRegistry(registry);
  next.books[bookIndex].items[itemIndex] = {
    ...next.books[bookIndex].items[itemIndex],
    title: nextTitle,
    authors: [...nextAuthors],
    translators: [...nextTranslators],
  };
  return successResult({
    ok: true as const,
    registry: next,
    item: next.books[bookIndex].items[itemIndex],
  });
}

// ----------------------------------------------------------------
// move / remove body item
// ----------------------------------------------------------------

function checkMoveIndex(
  toIndex: number,
  length: number,
): "invalid-input" | "invalid-index" | null {
  if (!Number.isInteger(toIndex)) return "invalid-input";
  if (toIndex < 0 || toIndex >= length) return "invalid-index";
  return null;
}

function moveInArray<T>(list: readonly T[], fromIndex: number, toIndex: number): T[] {
  const next = [...list];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export type MoveBodyItemInV3RegistryResult =
  | { ok: true; registry: BookManifestV3Registry; book: BookManifestV3Book }
  | {
      ok: false;
      reason: "invalid-input" | "missing-book" | "missing-item" | "invalid-index";
    };

export function moveBodyItemInV3Registry(
  registry: BookManifestV3Registry,
  bookId: string,
  itemId: string,
  toIndex: number,
): MoveBodyItemInV3RegistryResult {
  const bid = asNonEmptyId(bookId);
  const iid = asNonEmptyId(itemId);
  if (bid === null || iid === null) return { ok: false, reason: "invalid-input" };

  const bookIndex = registry.books.findIndex((book) => book.id === bid);
  if (bookIndex < 0) return { ok: false, reason: "missing-book" };
  const items = registry.books[bookIndex].items;
  const fromIndex = items.findIndex((item) => item.id === iid);
  if (fromIndex < 0) return { ok: false, reason: "missing-item" };

  const indexError = checkMoveIndex(toIndex, items.length);
  if (indexError !== null) return { ok: false, reason: indexError };

  const next = cloneRegistry(registry);
  next.books[bookIndex].items = moveInArray(next.books[bookIndex].items, fromIndex, toIndex);
  return successResult({ ok: true as const, registry: next, book: next.books[bookIndex] });
}

export type RemoveBodyItemFromV3RegistryResult =
  | { ok: true; registry: BookManifestV3Registry }
  | { ok: false; reason: "invalid-input" | "missing-book" | "missing-item" };

export function removeBodyItemFromV3Registry(
  registry: BookManifestV3Registry,
  bookId: string,
  itemId: string,
): RemoveBodyItemFromV3RegistryResult {
  const bid = asNonEmptyId(bookId);
  const iid = asNonEmptyId(itemId);
  if (bid === null || iid === null) return { ok: false, reason: "invalid-input" };

  const bookIndex = registry.books.findIndex((book) => book.id === bid);
  if (bookIndex < 0) return { ok: false, reason: "missing-book" };
  const itemIndex = registry.books[bookIndex].items.findIndex((item) => item.id === iid);
  if (itemIndex < 0) return { ok: false, reason: "missing-item" };

  const next = cloneRegistry(registry);
  next.books[bookIndex].items.splice(itemIndex, 1);
  return successResult({ ok: true as const, registry: next });
}

// ----------------------------------------------------------------
// add material
// ----------------------------------------------------------------

export type AddMaterialToV3RegistryInput = {
  path: string;
  role: BookManifestV3MaterialRole | string;
  title: string;
  authors: string[];
  translators: string[];
};

export type AddMaterialToV3RegistryResult =
  | { ok: true; registry: BookManifestV3Registry; material: BookManifestV3Material }
  | {
      ok: false;
      reason:
        | "invalid-input"
        | "invalid-path"
        | "invalid-role"
        | "duplicate-path"
        | "duplicate-id";
    };

export function addMaterialToV3Registry(
  registry: BookManifestV3Registry,
  input: AddMaterialToV3RegistryInput,
  makeId: (taken: ReadonlySet<string>) => string,
  options?: { maxIdAttempts?: number },
): AddMaterialToV3RegistryResult {
  const titleCheck = acceptCanonicalString(input.title, BOOK_MANIFEST_V3_MAX_TITLE_LENGTH);
  if (!titleCheck.ok) return { ok: false, reason: "invalid-input" };

  const authors = parseCanonicalCredits(input.authors);
  if (authors === null) return { ok: false, reason: "invalid-input" };
  const translators = parseCanonicalCredits(input.translators);
  if (translators === null) return { ok: false, reason: "invalid-input" };

  const normalizedPath = normalizeBookManifestRegistryPath(input.path);
  if (normalizedPath === null) return { ok: false, reason: "invalid-path" };

  const role = asKnownMaterialRole(input.role);
  if (role === null) return { ok: false, reason: "invalid-role" };

  if (
    collectAllRegistryPathKeys(registry).has(
      bookManifestRegistryPathComparisonKey(normalizedPath),
    )
  ) {
    return { ok: false, reason: "duplicate-path" };
  }

  const takenIds = collectAllMaterialIds(registry);
  const materialId = resolveUniqueId(takenIds, makeId, options?.maxIdAttempts ?? 8);
  if (materialId === null) return { ok: false, reason: "duplicate-id" };

  const material: BookManifestV3Material = {
    id: materialId,
    path: normalizedPath,
    role,
    title: titleCheck.value,
    authors,
    translators,
  };

  const next = cloneRegistry(registry);
  next.materials.push({
    ...material,
    authors: [...authors],
    translators: [...translators],
  });
  return successResult({ ok: true as const, registry: next, material });
}

// ----------------------------------------------------------------
// update material
// ----------------------------------------------------------------

export type UpdateMaterialInV3RegistryChanges = {
  title?: string;
  authors?: string[];
  translators?: string[];
  role?: BookManifestV3MaterialRole | string;
};

export type UpdateMaterialInV3RegistryResult =
  | { ok: true; registry: BookManifestV3Registry; material: BookManifestV3Material }
  | { ok: false; reason: "invalid-input" | "invalid-role" | "missing-material" };

export function updateMaterialInV3Registry(
  registry: BookManifestV3Registry,
  materialId: string,
  changes: UpdateMaterialInV3RegistryChanges,
): UpdateMaterialInV3RegistryResult {
  const mid = asNonEmptyId(materialId);
  if (mid === null) return { ok: false, reason: "invalid-input" };

  const index = registry.materials.findIndex((material) => material.id === mid);
  if (index < 0) return { ok: false, reason: "missing-material" };

  const current = registry.materials[index];
  let hasChange = false;

  let nextTitle = current.title;
  if (changes.title !== undefined) {
    const titleCheck = acceptCanonicalString(changes.title, BOOK_MANIFEST_V3_MAX_TITLE_LENGTH);
    if (!titleCheck.ok) return { ok: false, reason: "invalid-input" };
    if (titleCheck.value !== current.title) hasChange = true;
    nextTitle = titleCheck.value;
  }

  let nextAuthors = current.authors;
  if (changes.authors !== undefined) {
    const authors = parseCanonicalCredits(changes.authors);
    if (authors === null) return { ok: false, reason: "invalid-input" };
    if (!creditsEqual(authors, current.authors)) hasChange = true;
    nextAuthors = authors;
  }

  let nextTranslators = current.translators;
  if (changes.translators !== undefined) {
    const translators = parseCanonicalCredits(changes.translators);
    if (translators === null) return { ok: false, reason: "invalid-input" };
    if (!creditsEqual(translators, current.translators)) hasChange = true;
    nextTranslators = translators;
  }

  let nextRole = current.role;
  if (changes.role !== undefined) {
    const role = asKnownMaterialRole(changes.role);
    if (role === null) return { ok: false, reason: "invalid-role" };
    if (role !== current.role) hasChange = true;
    nextRole = role;
  }

  if (!hasChange) return { ok: false, reason: "invalid-input" };

  const next = cloneRegistry(registry);
  next.materials[index] = {
    ...next.materials[index],
    title: nextTitle,
    authors: [...nextAuthors],
    translators: [...nextTranslators],
    role: nextRole,
  };
  return successResult({
    ok: true as const,
    registry: next,
    material: next.materials[index],
  });
}

// ----------------------------------------------------------------
// move / remove material
// ----------------------------------------------------------------

export type MoveMaterialInV3RegistryResult =
  | { ok: true; registry: BookManifestV3Registry; material: BookManifestV3Material }
  | { ok: false; reason: "invalid-input" | "missing-material" | "invalid-index" };

export function moveMaterialInV3Registry(
  registry: BookManifestV3Registry,
  materialId: string,
  toIndex: number,
): MoveMaterialInV3RegistryResult {
  const mid = asNonEmptyId(materialId);
  if (mid === null) return { ok: false, reason: "invalid-input" };

  const fromIndex = registry.materials.findIndex((material) => material.id === mid);
  if (fromIndex < 0) return { ok: false, reason: "missing-material" };

  const indexError = checkMoveIndex(toIndex, registry.materials.length);
  if (indexError !== null) return { ok: false, reason: indexError };

  const next = cloneRegistry(registry);
  next.materials = moveInArray(next.materials, fromIndex, toIndex);
  return successResult({
    ok: true as const,
    registry: next,
    material: next.materials[toIndex],
  });
}

export type RemoveMaterialFromV3RegistryResult =
  | { ok: true; registry: BookManifestV3Registry }
  | { ok: false; reason: "invalid-input" | "missing-material" };

export function removeMaterialFromV3Registry(
  registry: BookManifestV3Registry,
  materialId: string,
): RemoveMaterialFromV3RegistryResult {
  const mid = asNonEmptyId(materialId);
  if (mid === null) return { ok: false, reason: "invalid-input" };

  const index = registry.materials.findIndex((material) => material.id === mid);
  if (index < 0) return { ok: false, reason: "missing-material" };

  const next = cloneRegistry(registry);
  next.materials.splice(index, 1);
  return successResult({ ok: true as const, registry: next });
}
