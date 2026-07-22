/**
 * Slice B1: Book frontmatter read-only helper.
 *
 * ブック管理（第3期B）の最初の安全スライス。
 * frontmatter の `book` / `title` / `order` / `role` を読み取るだけの pure module。
 *
 * 不変条件:
 * - UI / Electron / filesystem に依存しない。
 * - frontmatter を書き換えない（read-only）。
 * - frontmatter が source of truth。値は raw prefix からそのまま読む。
 *
 * 初期仕様:
 * - `book`: 非空 scalar string のみ有効。complex / empty は無効。
 * - `title`: 非空 scalar string のみ有効。未指定時のファイル名 fallback は一覧生成スライス側で扱う。
 * - `order`: finite number として解釈できる scalar のみ sort key として有効。
 * - `role`: body / synopsis / character / setting / note / material を既知 role とする。
 *   - role absent は body 相当として扱えるようにする（{@link isBodyEquivalentRole}）。
 *   - unknown / complex / empty role は unknown として保持し、body 判定には使わない。
 */

export const KNOWN_BOOK_ROLES = [
  "body",
  "synopsis",
  "character",
  "setting",
  "note",
  "material",
  // Slice B3: 「未整理」資料を既知 role として扱う（read-only parse のみ。書き込みはしない）。
  "unsorted",
] as const;

export type BookRole = (typeof KNOWN_BOOK_ROLES)[number];

/**
 * frontmatter 上の `role` の解決結果。
 * - `absent`: `role` キー自体が無い。初期MVPでは body 相当として扱う。
 * - `known`: 既知 role。
 * - `unknown`: キーはあるが、未知 / complex / empty。raw を保持し body 判定には使わない。
 */
export type BookRoleValue =
  | { state: "absent" }
  | { state: "known"; role: BookRole }
  | { state: "unknown"; raw: string };

export type BookFrontmatterFields = {
  /** 所属作品名。非空 scalar string のときだけ存在する。 */
  book?: string;
  /** ファイル単位の表示名。非空 scalar string のときだけ存在する。fallback は別スライス。 */
  title?: string;
  /** 作品内での並び順。finite number として解釈できたときだけ存在する。 */
  order?: number;
  /** ファイルの役割。常に解決済みの状態を返す。 */
  role: BookRoleValue;
};

const BOOK_SCALAR_KEYS = ["book", "title", "order", "role"] as const;
type BookScalarKey = (typeof BOOK_SCALAR_KEYS)[number];

function isFenceLine(line: string): boolean {
  return /^---[ \t]*$/.test(line);
}

/** YAML flow / block / anchor / alias / tag 指示子で始まる complex scalar を検出する。 */
function startsComplexScalar(trimmed: string): boolean {
  return /^(?:\[|\{|\||>|&|\*|!)/.test(trimmed);
}

/** quote を尊重しつつ末尾のインラインコメントを除いた、コメント前の文字列を返す（trim はしない）。 */
function stripInlineComment(rawValue: string): string {
  let inSingle = false;
  let inDouble = false;
  let escape = false;

  for (let i = 0; i < rawValue.length; i += 1) {
    const ch = rawValue[i];
    if (inDouble) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
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
    if (ch === "#" && (i === 0 || /\s/.test(rawValue[i - 1]))) {
      return rawValue.slice(0, i);
    }
  }
  return rawValue;
}

/** 対になる quote を 1 組だけ剥がす。 */
function stripMatchingQuotes(trimmed: string): string {
  if (trimmed.length < 2) return trimmed;
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

type ScalarReading =
  | { kind: "empty" }
  | { kind: "complex"; raw: string }
  | { kind: "value"; value: string };

/** コロン以降の raw 値を、empty / complex / 通常 scalar に分類する。 */
function readScalar(rawAfterColon: string): ScalarReading {
  const trimmed = stripInlineComment(rawAfterColon).trim();
  if (trimmed.length === 0) return { kind: "empty" };
  if (startsComplexScalar(trimmed)) return { kind: "complex", raw: trimmed };
  return { kind: "value", value: stripMatchingQuotes(trimmed) };
}

/**
 * frontmatter prefix から top-level の `book` / `title` / `order` / `role` の raw 値を集める。
 *
 * - fence 行と indent 行（block scalar 本体など）はスキップする。
 * - 同名キーは last-wins（既存 {@link parseFrontmatterFields} と整合）。
 */
function collectBookScalarLines(frontmatterPrefix: string): Map<BookScalarKey, string> {
  const result = new Map<BookScalarKey, string>();
  const lines = frontmatterPrefix.split("\n");
  for (const rawLine of lines) {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    if (isFenceLine(line)) continue;
    if (/^[ \t]/.test(line)) continue;
    const match = line.match(/^([A-Za-z0-9_-]+):(.*)$/);
    if (!match) continue;
    const key = match[1];
    if ((BOOK_SCALAR_KEYS as readonly string[]).includes(key)) {
      result.set(key as BookScalarKey, match[2]);
    }
  }
  return result;
}

function resolveBookRole(raw: string | undefined): BookRoleValue {
  if (raw === undefined) return { state: "absent" };
  const reading = readScalar(raw);
  if (reading.kind === "empty") return { state: "unknown", raw: "" };
  if (reading.kind === "complex") return { state: "unknown", raw: reading.raw };
  if ((KNOWN_BOOK_ROLES as readonly string[]).includes(reading.value)) {
    return { state: "known", role: reading.value as BookRole };
  }
  return { state: "unknown", raw: reading.value };
}

function resolveNonEmptyString(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const reading = readScalar(raw);
  if (reading.kind !== "value") return undefined;
  return reading.value.length > 0 ? reading.value : undefined;
}

function resolveOrder(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const reading = readScalar(raw);
  if (reading.kind !== "value") return undefined;
  const value = reading.value.trim();
  if (value.length === 0) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * frontmatter prefix から Book 用フィールドを読み取る。
 * frontmatter が無い / 空でも安全に動作し、`role` は常に解決済みの状態を返す。
 */
export function parseBookFrontmatterFields(frontmatterPrefix: string): BookFrontmatterFields {
  if (!frontmatterPrefix) {
    return { role: { state: "absent" } };
  }

  const raw = collectBookScalarLines(frontmatterPrefix);
  const fields: BookFrontmatterFields = {
    role: resolveBookRole(raw.get("role")),
  };

  const book = resolveNonEmptyString(raw.get("book"));
  if (book !== undefined) fields.book = book;

  const title = resolveNonEmptyString(raw.get("title"));
  if (title !== undefined) fields.title = title;

  const order = resolveOrder(raw.get("order"));
  if (order !== undefined) fields.order = order;

  return fields;
}

/**
 * 初期MVPで「本文（body）として扱ってよいか」を返す。
 * - `role` absent → true（body 相当）。
 * - 既知 `body` → true。
 * - それ以外の既知 role / unknown → false。
 */
export function isBodyEquivalentRole(role: BookRoleValue): boolean {
  if (role.state === "absent") return true;
  return role.state === "known" && role.role === "body";
}
