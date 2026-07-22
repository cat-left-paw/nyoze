/**
 * PV-READ-1 / PV-READ-2: Page Viewer 読書面（余白・用紙枠・header/footer）の
 * normalize helper。Display Settings には UI を置かず、Viewer 歯車 popover +
 * settings.json のみ。正本: `docs/page-viewer-settings-design-2026-07.md` §9。
 */

import {
  DEFAULT_PAGE_VIEWER_READING_FOOTER_ALIGN,
  DEFAULT_PAGE_VIEWER_READING_FOOTER_ENABLED,
  DEFAULT_PAGE_VIEWER_READING_HEADER_ALIGN,
  DEFAULT_PAGE_VIEWER_READING_HEADER_CONTENT,
  DEFAULT_PAGE_VIEWER_READING_HEADER_ENABLED,
  DEFAULT_PAGE_VIEWER_READING_MARGIN_BOTTOM,
  DEFAULT_PAGE_VIEWER_READING_MARGIN_INLINE,
  DEFAULT_PAGE_VIEWER_READING_MARGIN_TOP,
  DEFAULT_PAGE_VIEWER_READING_PAPER_FRAME,
  DEFAULT_PAGE_VIEWER_READING_SIMPLE_COVER_ENABLED,
  DEFAULT_PAGE_VIEWER_READING_SIMPLE_COVER_LAYOUT,
  DEFAULT_PAGE_VIEWER_READING_SIMPLE_COVER_WRITING_MODE,
  PAGE_VIEWER_READING_MARGIN_MAX,
  PAGE_VIEWER_READING_MARGIN_MIN,
  PAGE_VIEWER_READING_MARGIN_STEP,
} from './defaults'

/**
 * 本文frameに常に残す最小physical inset。PV-READ-2のfurniture予約ではない。
 * paperのheader clearは下のvisual outer marginが担うため、選択値0ではtop/bottom
 * とも8px、inlineは0pxだけを残す。
 */
export const PAGE_VIEWER_READING_SAFE_TOP = 8
export const PAGE_VIEWER_READING_SAFE_BOTTOM = 8
export const PAGE_VIEWER_READING_SAFE_INLINE = 0

/**
 * 用紙枠ON時だけのvisual canvas margin。本文frameのinsetとは別概念であり、
 * integrated header / macOS traffic lightsのclearはtop 44pxで確保する。
 */
export const PAGE_VIEWER_READING_PAPER_OUTER_TOP = 44
export const PAGE_VIEWER_READING_PAPER_OUTER_BOTTOM = 24
export const PAGE_VIEWER_READING_PAPER_OUTER_INLINE = 24

export type PageViewerReadingMarginPx =
  | 0
  | 8
  | 16
  | 24
  | 32
  | 40
  | 48
  | 56
  | 64
  | 72
  | 80

export const PAGE_VIEWER_READING_MARGIN_OPTIONS: readonly PageViewerReadingMarginPx[] = [
  0, 8, 16, 24, 32, 40, 48, 56, 64, 72, 80,
]

/**
 * 選択余白を 0〜80 / 8px 刻みへ正規化する。
 * 非数値・非有限は `fallback`（省略時は top 既定）へ。
 */
export function normalizePageViewerReadingMargin(
  value: unknown,
  fallback: number = DEFAULT_PAGE_VIEWER_READING_MARGIN_TOP,
): PageViewerReadingMarginPx {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return quantizePageViewerReadingMargin(fallback)
  }
  return quantizePageViewerReadingMargin(value)
}

function quantizePageViewerReadingMargin(value: number): PageViewerReadingMarginPx {
  const clamped = Math.min(
    PAGE_VIEWER_READING_MARGIN_MAX,
    Math.max(PAGE_VIEWER_READING_MARGIN_MIN, value),
  )
  const stepped =
    Math.round(clamped / PAGE_VIEWER_READING_MARGIN_STEP) * PAGE_VIEWER_READING_MARGIN_STEP
  return stepped as PageViewerReadingMarginPx
}

export function normalizePageViewerReadingMarginTop(value: unknown): PageViewerReadingMarginPx {
  return normalizePageViewerReadingMargin(value, DEFAULT_PAGE_VIEWER_READING_MARGIN_TOP)
}

export function normalizePageViewerReadingMarginBottom(value: unknown): PageViewerReadingMarginPx {
  return normalizePageViewerReadingMargin(value, DEFAULT_PAGE_VIEWER_READING_MARGIN_BOTTOM)
}

export function normalizePageViewerReadingMarginInline(value: unknown): PageViewerReadingMarginPx {
  return normalizePageViewerReadingMargin(value, DEFAULT_PAGE_VIEWER_READING_MARGIN_INLINE)
}

/** 用紙枠トグル。非 boolean は既定 true へ。 */
export function normalizePageViewerReadingPaperFrame(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  return DEFAULT_PAGE_VIEWER_READING_PAPER_FRAME
}

/** PV-READ-2: 読書面 furniture の物理位置。 */
export type PageViewerReadingFurnitureAlign = 'start' | 'center' | 'end'

/** PV-READ-2: header 内容 enum。author 表示は metadata visibility の hard gate 後。 */
export type PageViewerReadingHeaderContent = 'title' | 'title-author'

export const PAGE_VIEWER_READING_FURNITURE_ALIGN_OPTIONS: readonly PageViewerReadingFurnitureAlign[] = [
  'start',
  'center',
  'end',
]

export const PAGE_VIEWER_READING_HEADER_CONTENT_OPTIONS: readonly PageViewerReadingHeaderContent[] = [
  'title',
  'title-author',
]

export function normalizePageViewerReadingHeaderEnabled(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  return DEFAULT_PAGE_VIEWER_READING_HEADER_ENABLED
}

export function normalizePageViewerReadingFooterEnabled(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  return DEFAULT_PAGE_VIEWER_READING_FOOTER_ENABLED
}

export function normalizePageViewerReadingFurnitureAlign(
  value: unknown,
  fallback: PageViewerReadingFurnitureAlign,
): PageViewerReadingFurnitureAlign {
  if (value === 'start' || value === 'center' || value === 'end') return value
  return fallback
}

export function normalizePageViewerReadingHeaderAlign(value: unknown): PageViewerReadingFurnitureAlign {
  return normalizePageViewerReadingFurnitureAlign(value, DEFAULT_PAGE_VIEWER_READING_HEADER_ALIGN)
}

export function normalizePageViewerReadingFooterAlign(value: unknown): PageViewerReadingFurnitureAlign {
  return normalizePageViewerReadingFurnitureAlign(value, DEFAULT_PAGE_VIEWER_READING_FOOTER_ALIGN)
}

export function normalizePageViewerReadingHeaderContent(value: unknown): PageViewerReadingHeaderContent {
  if (value === 'title' || value === 'title-author') return value
  return DEFAULT_PAGE_VIEWER_READING_HEADER_CONTENT
}

/** PV-READ-3B: 表紙groupだけの書字方向。 */
export type PageViewerReadingSimpleCoverWritingMode = 'inherit' | 'vertical-rl' | 'horizontal-tb'
/** PV-READ-3B: Web Book / Tategakiと意味を揃えた通常/中央配置。 */
export type PageViewerReadingSimpleCoverLayout = 'normal' | 'center'

export const PAGE_VIEWER_READING_SIMPLE_COVER_WRITING_MODE_OPTIONS: readonly PageViewerReadingSimpleCoverWritingMode[] = [
  'inherit',
  'vertical-rl',
  'horizontal-tb',
]

export const PAGE_VIEWER_READING_SIMPLE_COVER_LAYOUT_OPTIONS: readonly PageViewerReadingSimpleCoverLayout[] = [
  'normal',
  'center',
]

export function normalizePageViewerReadingSimpleCoverEnabled(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  return DEFAULT_PAGE_VIEWER_READING_SIMPLE_COVER_ENABLED
}

export function normalizePageViewerReadingSimpleCoverWritingMode(
  value: unknown,
): PageViewerReadingSimpleCoverWritingMode {
  if (value === 'inherit' || value === 'vertical-rl' || value === 'horizontal-tb') return value
  return DEFAULT_PAGE_VIEWER_READING_SIMPLE_COVER_WRITING_MODE
}

export function normalizePageViewerReadingSimpleCoverLayout(value: unknown): PageViewerReadingSimpleCoverLayout {
  if (value === 'normal' || value === 'center') return value
  return DEFAULT_PAGE_VIEWER_READING_SIMPLE_COVER_LAYOUT
}

export type PageViewerReadingFurnitureResolved = {
  headerEnabled: boolean
  headerAlign: PageViewerReadingFurnitureAlign
  headerContent: PageViewerReadingHeaderContent
  footerEnabled: boolean
  footerAlign: PageViewerReadingFurnitureAlign
}

/** furniture 選択値を正規化する（geometry / reflow には影響しない）。 */
export function resolvePageViewerReadingFurnitureSettings(input: {
  headerEnabled?: unknown
  headerAlign?: unknown
  headerContent?: unknown
  footerEnabled?: unknown
  footerAlign?: unknown
}): PageViewerReadingFurnitureResolved {
  return {
    headerEnabled: normalizePageViewerReadingHeaderEnabled(input.headerEnabled),
    headerAlign: normalizePageViewerReadingHeaderAlign(input.headerAlign),
    headerContent: normalizePageViewerReadingHeaderContent(input.headerContent),
    footerEnabled: normalizePageViewerReadingFooterEnabled(input.footerEnabled),
    footerAlign: normalizePageViewerReadingFooterAlign(input.footerAlign),
  }
}

export type PageViewerReadingSurfaceResolved = {
  marginTop: PageViewerReadingMarginPx
  marginBottom: PageViewerReadingMarginPx
  marginInline: PageViewerReadingMarginPx
  paperFrame: boolean
  effectiveTop: number
  effectiveBottom: number
  effectiveInline: number
  paperOuterTop: number
  paperOuterBottom: number
  paperOuterInline: number
}

/** 選択値から実効余白（固定安全域込み）を組み立てる。 */
export function resolvePageViewerReadingSurfaceGeometry(input: {
  marginTop?: unknown
  marginBottom?: unknown
  marginInline?: unknown
  paperFrame?: unknown
}): PageViewerReadingSurfaceResolved {
  const marginTop = normalizePageViewerReadingMarginTop(input.marginTop)
  const marginBottom = normalizePageViewerReadingMarginBottom(input.marginBottom)
  const marginInline = normalizePageViewerReadingMarginInline(input.marginInline)
  const paperFrame = normalizePageViewerReadingPaperFrame(input.paperFrame)
  return {
    marginTop,
    marginBottom,
    marginInline,
    paperFrame,
    effectiveTop: PAGE_VIEWER_READING_SAFE_TOP + marginTop,
    effectiveBottom: PAGE_VIEWER_READING_SAFE_BOTTOM + marginBottom,
    effectiveInline: PAGE_VIEWER_READING_SAFE_INLINE + marginInline,
    paperOuterTop: paperFrame ? PAGE_VIEWER_READING_PAPER_OUTER_TOP : 0,
    paperOuterBottom: paperFrame ? PAGE_VIEWER_READING_PAPER_OUTER_BOTTOM : 0,
    paperOuterInline: paperFrame ? PAGE_VIEWER_READING_PAPER_OUTER_INLINE : 0,
  }
}
