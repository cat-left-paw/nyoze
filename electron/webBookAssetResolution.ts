/**
 * WB-IMG-1: main-side resolution of Web Book `WebBookAssetRequest`s into
 * validated `data:` URLs.
 *
 * Design: `docs/web-book-assets-design-2026-07.md`.
 *
 * This module is the *only* place that decides whether an image reference is
 * safe to embed. The renderer / pure semantic layer (`htmlExportSemantic.ts`)
 * never classifies `rawSrc`, never reads bytes, and never knows a project
 * root — it only forwards `{ refId, rawSrc, origin }`. Given a resolver that
 * maps `origin` to a base directory + allowed containment root + a safe
 * label, this module does the full validation pipeline:
 *
 * 1. reject empty / oversized / null-byte / any-scheme (remote, `file:`,
 *    `data:`, `blob:`, `javascript:`, unknown) / UNC / percent-encoded
 *    `rawSrc`
 * 2. resolve relative to the origin's base directory (absolute input paths
 *    are also accepted here — containment is what matters, not the input
 *    shape)
 * 3. `realpath` and verify containment within the allowed root (closes
 *    symlink escape), capturing an `lstat` identity (dev/ino) anchor at that
 *    same path
 * 4. open a file descriptor, `fstat` on that same fd, and require its
 *    dev/ino to match the anchor from step 3 — a mismatch means the path was
 *    swapped out between the containment check and the open, and aborts the
 *    request instead of trusting whatever is now behind the fd
 * 5. using that fd's `fstat` (regular file + size ceiling), read *exactly*
 *    the checked byte count in a loop that fails closed on any short read
 *    (never accepts a truncated buffer as if it were the whole file), and
 *    never a separate unbounded read that could race a concurrently growing
 *    file past the ceiling
 * 6. sniff the real format from those bytes (magic bytes, not extension)
 * 7. SHA-256 dedupe → build (or reuse) a `data:` URL
 *
 * Any single failure aborts the whole batch (returned as a failure list) —
 * callers must not call `writeHtmlExportFile` / show a Save dialog when
 * `resolveWebBookAssets` returns `{ ok: false }`.
 *
 * `WebBookAssetFailure.rawSrc` is a *display-safe* reference, not
 * necessarily the literal request value: any absolute path (POSIX `/...`,
 * Windows drive-absolute `C:\...`, or Windows root-relative `\Users\...`),
 * any `scheme:` URL (including `file:///...`), and any UNC path are redacted
 * before they ever leave this module, so the renderer/result-details UI
 * never receives a raw filesystem path.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { isWithinDirectory } from "./ipcSecurity";
import { sniffImageFormat } from "../src/editor-core/io/imageFormatSniff";
import { exceedsImagePixelLimit, parseImageDimensions } from "../src/editor-core/io/imageDimensions";
import type {
  WebBookAssetFailure,
  WebBookAssetOrigin,
  WebBookAssetRequest,
} from "../src/editor-core/export/webBookAssetPlan";

/** Individual image ceiling (§7 of the design doc). */
export const MAX_WEB_BOOK_IMAGE_BYTES = 25 * 1024 * 1024;
/** Soft warn threshold for unique images (WB-IMG-3A). Hard reject remains `MAX_WEB_BOOK_IMAGE_BYTES`. */
export const WEB_BOOK_IMAGE_WARN_BYTES = 10 * 1024 * 1024;
/** Single-HTML hard ceiling — checked by the caller against the materialized HTML byte length. */
export const MAX_WEB_BOOK_HTML_BYTES = 100 * 1024 * 1024;

const MAX_RAW_SRC_LENGTH = 4096;

/** Where a given `origin` resolves to, decided entirely by main (never by the renderer). */
export type WebBookAssetOriginContext = {
  /** Directory relative `rawSrc` resolves from (the origin document/chapter's own parent). */
  baseDir: string;
  /** realpath'd containment root; the resolved image must stay within this directory. */
  allowedRoot: string;
  /** Safe, non-path label surfaced to the renderer on failure (document title / chapter title). */
  originLabel: string;
};

export type ResolveWebBookAssetOriginContext = (
  origin: WebBookAssetOrigin,
) => WebBookAssetOriginContext | null;

/** Safe display metadata for unique assets over the soft size warn threshold (WB-IMG-3A). */
export type WebBookResolvedLargeImageWarning = {
  originLabel: string;
  rawSrc: string;
  byteLength: number;
};

export type WebBookAssetResolutionResult =
  | {
      ok: true;
      registry: ResolvedWebBookAssetRegistry;
      dataUrlByRefId: ReadonlyMap<string, string>;
      largeImageWarnings: readonly WebBookResolvedLargeImageWarning[];
    }
  | { ok: false; failures: readonly WebBookAssetFailure[] };

/**
 * main process だけが持つ、検証済み画像bytesのregistry。
 * renderer / pure converter へ返さず、single HTML と package の両方をこの正本から
 * materialize する。assetId は export 内でのみ有効な安定した連番である。
 */
export type ResolvedWebBookAsset = {
  assetId: string;
  kind: "image";
  mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  extension: "png" | "jpg" | "webp" | "gif";
  byteLength: number;
  sha256: string;
  bytes: Uint8Array;
};

export type ResolvedWebBookAssetRegistry = {
  assetByRefId: ReadonlyMap<string, ResolvedWebBookAsset>;
  assets: readonly ResolvedWebBookAsset[];
};

/**
 * The following `rawSrc` classification predicates are exported purely so
 * they can be unit tested in isolation from real filesystem paths — a
 * literal Windows-shaped string (`C:\...`) is not a valid filename on a real
 * Windows filesystem, so exercising the classification logic directly (string
 * in, boolean out) is the only way to regression-test it identically on every
 * platform the test suite runs on.
 */

export function isUncPath(rawSrc: string): boolean {
  return rawSrc.startsWith("\\\\") || rawSrc.startsWith("//");
}

/** `C:\...` / `C:/...` — a Windows drive-absolute path, not a `scheme:` reference. */
export function isWindowsDriveAbsolute(rawSrc: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(rawSrc);
}

export function hasUnsupportedScheme(rawSrc: string): boolean {
  // A Windows drive letter (`C:\...`) would otherwise match the generic
  // `scheme:` shape below — exclude it so allowed absolute Windows paths
  // aren't misclassified as an unsupported scheme before containment is
  // ever checked.
  if (isWindowsDriveAbsolute(rawSrc)) return false;
  // Any other `scheme:` prefix (http, https, file, data, blob, javascript,
  // vbscript, or anything unknown) is rejected — v1 only ever embeds a real
  // local file.
  return /^[a-z][a-z0-9+.-]*:/i.test(rawSrc);
}

/**
 * Reject any percent-encoded byte (`%XX`), not just the ones that decode to
 * `.` / `/` / `\`. The design boundary is "never interpret `rawSrc` as a
 * URL" — this app's own Markdown image syntax never needs percent-encoding
 * for a legitimate relative filename, so treating *any* escape as
 * unsupported avoids both single- and double-encoded traversal/separator
 * tricks (e.g. `%2e%2e%2f`, `%252f`) without needing a decode step at all.
 */
export function hasPercentEncoding(rawSrc: string): boolean {
  return /%[0-9a-fA-F]{2}/.test(rawSrc);
}

/**
 * True for anything absolute on *either* platform's rules — including a
 * Windows drive-absolute path (`C:\...`), a Windows root-relative path
 * (`\Users\...`, absolute on the current drive), and a POSIX absolute path
 * (`/...`). Checked against both `path.win32` and `path.posix` regardless of
 * the host OS, since a shared/imported document could carry either form.
 */
export function isAbsoluteLocalPath(rawSrc: string): boolean {
  return path.win32.isAbsolute(rawSrc) || path.posix.isAbsolute(rawSrc);
}

/**
 * `rawSrc` originates from the document itself, so a plain relative
 * reference is safe to echo back (it's exactly what the current user's own
 * document already contains). An absolute path, any `scheme:` reference
 * (including `file:///...`, which is itself an absolute path), or a UNC
 * path can expose filesystem structure that doesn't belong in a UI string —
 * those are redacted to a fixed placeholder instead.
 */
/** Exported for capacity-warning tests; production callers use resolveWebBookAssets. */
export function sanitizeRawSrcForDisplay(rawSrc: string): string {
  if (isUncPath(rawSrc) || hasUnsupportedScheme(rawSrc) || isAbsoluteLocalPath(rawSrc)) {
    return "(参照元は伏せています)";
  }
  return rawSrc;
}

/** Minimal identity shape compared to detect a path swap between check and use. */
type StatIdentity = { dev: number; ino: number };

/** Exported for unit testing in isolation from real fd/lstat plumbing. */
export function statIdentityMatches(anchor: StatIdentity, candidate: StatIdentity): boolean {
  return anchor.dev === candidate.dev && anchor.ino === candidate.ino;
}

/**
 * Read exactly `size` bytes via `read`, looping to completion and advancing
 * the offset on partial reads. Returns `null` (fail closed) on any read
 * error or on a 0-byte read reached before `size` — never returns a
 * truncated buffer as if it were the complete file.
 *
 * `read` mirrors `fs.readSync`'s signature so the real call site can pass
 * `fs.readSync` directly; tests inject a mock to simulate short reads
 * without needing real OS-level partial-read conditions.
 */
export function readExactlyOrFail(
  read: (buffer: Buffer, offset: number, length: number, position: number) => number,
  size: number,
): Buffer | null {
  const buffer = Buffer.alloc(size);
  let totalRead = 0;
  while (totalRead < size) {
    let bytesRead: number;
    try {
      bytesRead = read(buffer, totalRead, size - totalRead, totalRead);
    } catch {
      return null;
    }
    if (bytesRead <= 0) return null;
    totalRead += bytesRead;
  }
  return buffer;
}

function failure(
  code: WebBookAssetFailure["code"],
  originLabel: string,
  rawSrc: string,
  message: string,
): { ok: false; failure: WebBookAssetFailure } {
  return {
    ok: false,
    failure: { code, originLabel, rawSrc: sanitizeRawSrcForDisplay(rawSrc), message },
  };
}

type ResolvedAssetBytes = {
  ok: true;
  sha256: string;
  bytes: Buffer;
  mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  extension: "png" | "jpg" | "webp" | "gif";
};

function resolveOneAsset(
  request: WebBookAssetRequest,
  resolveOrigin: ResolveWebBookAssetOriginContext,
): ResolvedAssetBytes | { ok: false; failure: WebBookAssetFailure } {
  const originCtx = resolveOrigin(request.origin);
  const originLabel = originCtx?.originLabel ?? "";

  if (!originCtx) {
    return failure(
      "unsupported-source",
      originLabel,
      request.rawSrc,
      "画像の参照元文書を特定できませんでした。",
    );
  }

  const rawSrc = request.rawSrc;
  if (
    typeof rawSrc !== "string" ||
    rawSrc.length === 0 ||
    rawSrc.length > MAX_RAW_SRC_LENGTH ||
    rawSrc.includes("\0")
  ) {
    return failure(
      "unsupported-source",
      originLabel,
      rawSrc,
      "画像の参照が不正です。",
    );
  }
  if (isUncPath(rawSrc) || hasUnsupportedScheme(rawSrc)) {
    return failure(
      "unsupported-source",
      originLabel,
      rawSrc,
      "リモート URL や特殊な scheme の画像は埋め込めません。",
    );
  }
  if (hasPercentEncoding(rawSrc)) {
    return failure(
      "unsupported-source",
      originLabel,
      rawSrc,
      "URL エンコードされた画像参照は埋め込めません。",
    );
  }

  const resolvedPath = path.resolve(originCtx.baseDir, rawSrc);
  let realImagePath: string;
  try {
    realImagePath = fs.realpathSync(resolvedPath);
  } catch {
    return failure("missing", originLabel, rawSrc, "画像ファイルが見つかりませんでした。");
  }

  if (!isWithinDirectory(realImagePath, originCtx.allowedRoot)) {
    return failure(
      "outside-allowed-root",
      originLabel,
      rawSrc,
      "許可された範囲外の画像は埋め込めません。",
    );
  }

  // Capture an identity anchor (dev/ino) for the exact path we just verified
  // is inside the allowed root, *before* opening it. `lstat` (not `stat`) is
  // deliberate: if something swaps this path for a new symlink between here
  // and the `openSync` below, the anchor reflects the symlink's own
  // identity, which will never match the fd's `fstat` identity (which
  // follows the link) — the mismatch check below then rejects the swap
  // instead of silently reading whatever the new link points to.
  let identityAnchor: fs.Stats;
  try {
    identityAnchor = fs.lstatSync(realImagePath);
  } catch {
    return failure("read-failed", originLabel, rawSrc, "画像ファイルを読み込めませんでした。");
  }

  // Open a single fd and fstat/read through that same fd: the size check and
  // the actual read below both observe the same underlying file description,
  // and the read is bounded to exactly the checked byte count. This closes a
  // TOCTOU gap where a separate `statSync` + `readFileSync` pair could read
  // more than `MAX_WEB_BOOK_IMAGE_BYTES` if the file grew concurrently
  // between the two calls.
  let fd: number;
  try {
    fd = fs.openSync(realImagePath, "r");
  } catch {
    return failure("read-failed", originLabel, rawSrc, "画像ファイルを読み込めませんでした。");
  }

  let bytes: Buffer;
  try {
    let stat: fs.Stats;
    try {
      stat = fs.fstatSync(fd);
    } catch {
      return failure("read-failed", originLabel, rawSrc, "画像ファイルを読み込めませんでした。");
    }
    if (!statIdentityMatches(identityAnchor, stat)) {
      return failure(
        "read-failed",
        originLabel,
        rawSrc,
        "画像ファイルの検証中に内容が変化したため中止しました。",
      );
    }
    if (!stat.isFile()) {
      return failure(
        "not-regular-file",
        originLabel,
        rawSrc,
        "通常のファイルではない参照は埋め込めません。",
      );
    }
    if (stat.size > MAX_WEB_BOOK_IMAGE_BYTES) {
      return failure(
        "image-too-large",
        originLabel,
        rawSrc,
        "画像のファイルサイズが上限（25MB）を超えています。",
      );
    }

    // Read to completion, bounded to exactly `stat.size` bytes. Any short
    // read (e.g. a concurrent truncation) fails closed instead of silently
    // embedding a truncated image as if it were the whole file.
    const read = readExactlyOrFail((buf, offset, length, position) => {
      return fs.readSync(fd, buf, offset, length, position);
    }, stat.size);
    if (read === null) {
      return failure("read-failed", originLabel, rawSrc, "画像ファイルを読み込めませんでした。");
    }
    bytes = read;
  } finally {
    try {
      fs.closeSync(fd);
    } catch {
      // best-effort close; the fd will still be reclaimed on process exit.
    }
  }

  const sniffed = sniffImageFormat(bytes);
  if (!sniffed) {
    return failure(
      "unsupported-image-format",
      originLabel,
      rawSrc,
      "対応していない画像形式です（PNG / JPEG / WebP / GIF のみ埋め込めます）。",
    );
  }

  const dimensions = parseImageDimensions(bytes, sniffed);
  if (!dimensions) {
    return failure(
      "unsupported-image-format",
      originLabel,
      rawSrc,
      "画像ヘッダを解析できませんでした（PNG / JPEG / WebP / GIF のみ埋め込めます）。",
    );
  }
  if (exceedsImagePixelLimit(dimensions)) {
    return failure(
      "image-pixel-limit-exceeded",
      originLabel,
      rawSrc,
      "画像の画素数が上限（1億画素）を超えています。",
    );
  }

  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  return { ok: true, sha256, bytes, mediaType: sniffed.mediaType, extension: sniffed.extension };
}

/**
 * Resolve every asset request. Returns `{ ok: false, failures }` (never
 * partial) if any single request fails — the whole Web Book export must be
 * aborted before any Save dialog / write in that case.
 *
 * Identical bytes (by SHA-256, not by `rawSrc` or filename) reuse the same
 * verified bytes, even across distinct requests / chapters.
 */
export function resolveWebBookAssets(
  requests: readonly WebBookAssetRequest[],
  resolveOrigin: ResolveWebBookAssetOriginContext,
): WebBookAssetResolutionResult {
  const failures: WebBookAssetFailure[] = [];
  const assetByRefId = new Map<string, ResolvedWebBookAsset>();
  const assetByHash = new Map<string, ResolvedWebBookAsset>();
  const largeImageWarnings: WebBookResolvedLargeImageWarning[] = [];
  const largeImageHashes = new Set<string>();

  for (const request of requests) {
    const resolved = resolveOneAsset(request, resolveOrigin);
    if (!resolved.ok) {
      failures.push(resolved.failure);
      continue;
    }
    let asset = assetByHash.get(resolved.sha256);
    if (asset === undefined) {
      asset = {
        assetId: `wb-image-${assetByHash.size}`,
        kind: "image",
        mediaType: resolved.mediaType,
        extension: resolved.extension,
        byteLength: resolved.bytes.byteLength,
        sha256: resolved.sha256,
        bytes: resolved.bytes,
      };
      assetByHash.set(resolved.sha256, asset);
      // Soft capacity warn (WB-IMG-3A): unique assets only, safe display fields.
      if (asset.byteLength > WEB_BOOK_IMAGE_WARN_BYTES && !largeImageHashes.has(resolved.sha256)) {
        largeImageHashes.add(resolved.sha256);
        const originCtx = resolveOrigin(request.origin);
        largeImageWarnings.push({
          originLabel: originCtx?.originLabel ?? "",
          rawSrc: sanitizeRawSrcForDisplay(request.rawSrc),
          byteLength: asset.byteLength,
        });
      }
    }
    assetByRefId.set(request.refId, asset);
  }

  if (failures.length > 0) return { ok: false, failures };
  const registry = { assetByRefId, assets: [...assetByHash.values()] };
  return {
    ok: true,
    registry,
    dataUrlByRefId: materializeWebBookDataUrls(registry),
    largeImageWarnings,
  };
}

/** single HTML profile only: keep WB-IMG-1 data URL behavior exactly. */
export function materializeWebBookDataUrls(
  registry: ResolvedWebBookAssetRegistry,
): ReadonlyMap<string, string> {
  const values = new Map<string, string>();
  for (const [refId, asset] of registry.assetByRefId) {
    values.set(refId, `data:${asset.mediaType};base64,${Buffer.from(asset.bytes).toString("base64")}`);
  }
  return values;
}
