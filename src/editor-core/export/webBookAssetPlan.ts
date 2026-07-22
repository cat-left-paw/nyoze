/**
 * WB-IMG-1: Web Book asset plan / template artifact (pure, no fs / Electron).
 *
 * Design: `docs/web-book-assets-design-2026-07.md`.
 *
 * The semantic converter (`htmlExportSemantic.ts` / `webBookExport.ts` /
 * `bookExportConversion.ts`) never reads local images or knows a project
 * root. Instead it emits a `WebBookAssetRequest` per `nyoze_image` occurrence
 * (kept distinct even when several occurrences share the same `rawSrc`) and
 * an ordered `HtmlTemplatePart[]` with an `asset` hole in place of the
 * `<img>` `src` value. Only `electron/webBookAssetResolution.ts` (main
 * process) resolves those holes to validated `data:` URLs — this module
 * never touches the filesystem and never does string / regex replacement
 * over the assembled HTML; it only concatenates trusted parts in order.
 */

export type WebBookAssetOrigin =
  | { kind: 'active-document' }
  | { kind: 'book-chapter'; chapterId: string }

export type WebBookAssetRequest = {
  /** Export-internal unique id assigned by the converter. Never derived from document content. */
  refId: string
  kind: 'image'
  /** The `nyoze_image` node's raw, unvalidated `src` attribute, verbatim. */
  rawSrc: string
  origin: WebBookAssetOrigin
}

export type HtmlTemplatePart =
  | { kind: 'html'; value: string }
  | { kind: 'asset'; refId: string }

/** Web Book の出力コンテナ。既定の単一HTMLは後方互換を維持する。 */
export type WebBookOutputProfile = 'singleHtml' | 'package'

export const DEFAULT_WEB_BOOK_OUTPUT_PROFILE: WebBookOutputProfile = 'singleHtml'

/** Wrap a literal (already-escaped) HTML string as a single-part template fragment. */
export function htmlPart(value: string): HtmlTemplatePart[] {
  return value.length > 0 ? [{ kind: 'html', value }] : []
}

/** A single asset hole referencing `refId`; resolved later by main. */
export function assetHolePart(refId: string): HtmlTemplatePart[] {
  return [{ kind: 'asset', refId }]
}

/** Concatenate template fragments in order. Never reorders or searches content. */
export function concatTemplateParts(
  ...parts: ReadonlyArray<readonly HtmlTemplatePart[]>
): HtmlTemplatePart[] {
  const result: HtmlTemplatePart[] = []
  for (const part of parts) result.push(...part)
  return result
}

/** Number of asset holes in a template (each `nyoze_image` occurrence counts once, even if `rawSrc` repeats). */
export function countTemplateAssetHoles(template: readonly HtmlTemplatePart[]): number {
  let count = 0
  for (const part of template) if (part.kind === 'asset') count++
  return count
}

/**
 * Concatenate a template artifact into the final HTML string once every
 * asset hole has a resolved value (a `data:image/...;base64,...` URL).
 *
 * This performs no string search / replace: it walks the ordered part list
 * once and appends either a trusted literal or a resolved value looked up by
 * `refId`. Throws if a referenced `refId` has no resolved value — callers
 * must resolve every request first (main aborts the whole export before
 * calling this if any asset failed validation).
 */
export function materializeWebBookTemplate(
  template: readonly HtmlTemplatePart[],
  resolvedByRefId: ReadonlyMap<string, string>,
): string {
  let html = ''
  for (const part of template) {
    if (part.kind === 'html') {
      html += part.value
      continue
    }
    const resolved = resolvedByRefId.get(part.refId)
    if (resolved === undefined) {
      throw new Error(`materializeWebBookTemplate: unresolved asset ref "${part.refId}"`)
    }
    html += resolved
  }
  return html
}

/**
 * Per-asset validation failure, safe to surface to the renderer UI.
 * Deliberately excludes absolute paths, realpaths, staging paths, hashes,
 * and raw OS error text — callers must only put user-safe text in `message`.
 */
export type WebBookAssetFailureCode =
  | 'unsupported-source'
  | 'outside-allowed-root'
  | 'missing'
  | 'not-regular-file'
  | 'read-failed'
  | 'unsupported-image-format'
  | 'image-too-large'
  | 'image-pixel-limit-exceeded'

export type WebBookAssetFailure = {
  code: WebBookAssetFailureCode
  originLabel: string
  rawSrc: string
  message: string
}

/**
 * Sequential `refId` generator scoped to a single export call. Ids are never
 * derived from document/user content, so they cannot collide with anything
 * an attacker could place in the document text.
 */
export function createWebBookAssetRefIdGenerator(): () => string {
  let n = 0
  return () => {
    const id = `wb-asset-${n}`
    n += 1
    return id
  }
}
