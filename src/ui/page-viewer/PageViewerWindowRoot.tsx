/**
 * 軽量ページビューア window (`?nyozeWindow=page-viewer&payloadId=...`) の root
 * component。`payloadId` から main の一時 payload store (`pageViewer:getSnapshot`)
 * を取得し、viewer window 側で `parseMarkdown → PageModel → PageViewModel` を
 * 組み立てて読み取り専用表示を行う。
 *
 * pagination は CSS multicol + mask + transform 方式
 * (`docs/page-viewer-css-columns-design-2026-07.md` §12)。現在ページだけを
 * 表示し、前後ページの露出や本文 glyph の欠けを構造的に作らない:
 *
 * - `.page-viewer-window__body`: 本文領域 (writing mode surface)。overflow hidden。
 * - `.page-viewer-window__page-frame`: 1 ページぶんの可視マスク (overflow hidden)。
 * - `.page-viewer-window__page-flow`: CSS multicol container。column CSS と
 *   transform は `usePageViewerColumnLayout` (DOM 側 adapter) が専有して書く。
 *
 * ページ移動 (keyboard / scrubber) はすべて page index ベースで、
 * `pageIndex * pitch` の transform だけを使う。任意 scroll offset の疑似
 * ページ送り・live scrollWidth/scrollHeight からの pageCount 再計算はしない。
 */

import {
  IconCheck,
  IconListTree,
  IconPalette,
  IconPin,
  IconPinned,
  IconSettings,
  IconSwitchHorizontal,
  IconSwitchVertical,
  IconTransitionRight,
} from '@tabler/icons-react'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent,
  type RefObject,
} from 'react'
import type { PageViewAnchor, PageViewItem, PageViewModel, PageViewSyntheticItem } from '../../editor-core/io/pageModelView'
import { DEFAULT_DISPLAY_SETTINGS } from '../../settings/defaults'
import {
  normalizePageViewerBreakBeforeHeading,
  normalizePageViewerBreakBeforeHeadingMaxLevel,
} from '../../settings/pageViewerHeadingPaginationSettings'
import {
  PAGE_VIEWER_READING_FURNITURE_ALIGN_OPTIONS,
  PAGE_VIEWER_READING_HEADER_CONTENT_OPTIONS,
  PAGE_VIEWER_READING_MARGIN_OPTIONS,
  PAGE_VIEWER_READING_SIMPLE_COVER_LAYOUT_OPTIONS,
  PAGE_VIEWER_READING_SIMPLE_COVER_WRITING_MODE_OPTIONS,
  normalizePageViewerReadingSimpleCoverEnabled,
  normalizePageViewerReadingSimpleCoverLayout,
  normalizePageViewerReadingSimpleCoverWritingMode,
  resolvePageViewerReadingFurnitureSettings,
  resolvePageViewerReadingSurfaceGeometry,
  type PageViewerReadingFurnitureAlign,
  type PageViewerReadingHeaderContent,
  type PageViewerReadingMarginPx,
  type PageViewerReadingSimpleCoverLayout,
  type PageViewerReadingSimpleCoverWritingMode,
} from '../../settings/pageViewerReadingSurfaceSettings'
import { patchSettingsJson } from '../../settings/storage'
import type { WritingMode } from '../../settings/types'
import {
  resolveAutoTcyDigitRange,
  resolveAutoTcyNumbersOnly,
  shouldEnableAutoTcyDisplay,
} from '../../editor-core/features/autoTcy'
import { deriveDocThemeTokens } from '../../theme/deriveDocThemeTokens'
import { useWindowControlsOverlayReservation } from '../hooks/useWindowControlsOverlayReservation'
import { detectRuntimePlatform } from '../utils/platform'
import { pageIndexFromProgressRatio, progressRatioForPageIndex, clampPageIndex } from './pageViewerColumnMetrics'
import { computeHeadingJumpLocalPageIndex, resolveHeadingJumpTarget } from './pageViewerHeadingJump'
import {
  renderPageViewerFlowBlock,
  type PageViewerAutoTcyRenderOptions,
} from './pageViewerNodeRenderer'
import { resolvePageViewerMetadataDisplay } from './pageViewerMetadataDisplay'
import {
  formatPageViewerReadingFurnitureFooter,
  resolvePageViewerReadingFurnitureHeaderFromPayload,
} from './pageViewerReadingFurniture'
import { resolvePageMoveDirectionForKey, type PageMoveDirection } from './pageViewerPageNavigation'
import {
  beginPageTurnFadeInPhase,
  beginPageTurnFadeOutPhase,
  clearPageTurnTransitionElements,
  DEFAULT_PAGE_VIEWER_PAGE_TURN_SPEED_MS,
  DEFAULT_PAGE_VIEWER_PAGE_TURN_TRANSITION,
  normalizePageTurnSpeedMs,
  PAGE_VIEWER_PAGE_TURN_FADE_OUT_CLASS,
  PAGE_VIEWER_PAGE_TURN_SPEED_MAX_MS,
  PAGE_VIEWER_PAGE_TURN_SPEED_MIN_MS,
  PAGE_VIEWER_PAGE_TURN_SPEED_STEP_MS,
  PAGE_VIEWER_PAGE_TURN_TRANSITION_LABELS,
  PAGE_VIEWER_PAGE_TURN_TRANSITION_OPTIONS,
  prefersReducedMotion,
  resolvePageTurnDirection,
  resolvePageTurnTransitionDurationMs,
  restartPageTurnTransitionAnimation,
  shouldTriggerPageTurnTransition,
  type PageTurnDirection,
  type PageViewerPageTurnTransition,
} from './pageViewerPageTurnTransition'
import {
  DEFAULT_PAGE_VIEWER_READER_THEME,
  PAGE_VIEWER_READER_THEME_LABELS,
  PAGE_VIEWER_READER_THEME_OPTIONS,
  resolvePageViewerReaderThemeColors,
  type PageViewerReaderTheme,
  type PageViewerReaderThemeDocumentColors,
} from './pageViewerReaderTheme'
import {
  flipRatioForWritingMode,
  pageIndexFromScrubberPointer,
  resolveScrubberKeyAction,
  scrubberAriaProps,
} from './pageViewerScrubber'
import { buildPageViewModelFromSnapshot } from './pageViewerSnapshotView'
import type { PageViewerImageScope, PageViewerSnapshotPayload } from './pageViewerTypes'
import type { PageViewerUiThemeSnapshot } from './pageViewerUiTheme'
import { usePageViewerColumnLayout } from './usePageViewerColumnLayout'
import { usePageViewerPageSequence } from './usePageViewerPageSequence'
import { PageViewerSimpleCoverFrame } from './pageViewerSimpleCoverFrame'
import './PageViewerWindowRoot.css'

const OUTLINE_PANEL_ID = 'page-viewer-outline-panel'
const OUTLINE_TOGGLE_ICON_SIZE = 16
const OUTLINE_TOGGLE_ICON_STROKE = 1.1
const THEME_MENU_LISTBOX_ID = 'page-viewer-theme-menu-listbox'
const TRANSITION_MENU_LISTBOX_ID = 'page-viewer-transition-menu-listbox'
const TRANSITION_SPEED_INPUT_ID = 'page-viewer-transition-speed-input'
const SETTINGS_POPOVER_ID = 'page-viewer-settings-popover'
const SETTINGS_HEADING_LEVEL_SELECT_ID = 'page-viewer-settings-heading-level-select'
const SETTINGS_READING_MARGIN_TOP_SELECT_ID = 'page-viewer-settings-reading-margin-top-select'
const SETTINGS_READING_MARGIN_BOTTOM_SELECT_ID = 'page-viewer-settings-reading-margin-bottom-select'
const SETTINGS_READING_MARGIN_INLINE_SELECT_ID = 'page-viewer-settings-reading-margin-inline-select'
const SETTINGS_READING_HEADER_ALIGN_SELECT_ID = 'page-viewer-settings-reading-header-align-select'
const SETTINGS_READING_HEADER_CONTENT_SELECT_ID = 'page-viewer-settings-reading-header-content-select'
const SETTINGS_READING_FOOTER_ALIGN_SELECT_ID = 'page-viewer-settings-reading-footer-align-select'
const SETTINGS_READING_SIMPLE_COVER_WRITING_MODE_SELECT_ID = 'page-viewer-settings-reading-simple-cover-writing-mode-select'
const SETTINGS_READING_SIMPLE_COVER_LAYOUT_SELECT_ID = 'page-viewer-settings-reading-simple-cover-layout-select'

type ReadingSurfaceOverride = {
  marginTop: PageViewerReadingMarginPx
  marginBottom: PageViewerReadingMarginPx
  marginInline: PageViewerReadingMarginPx
  paperFrame: boolean
  headerEnabled: boolean
  headerAlign: PageViewerReadingFurnitureAlign
  headerContent: PageViewerReadingHeaderContent
  footerEnabled: boolean
  footerAlign: PageViewerReadingFurnitureAlign
  simpleCoverEnabled: boolean
  simpleCoverWritingMode: PageViewerReadingSimpleCoverWritingMode
  simpleCoverLayout: PageViewerReadingSimpleCoverLayout
}

const FURNITURE_ALIGN_LABELS: Record<PageViewerReadingFurnitureAlign, string> = {
  start: '左',
  center: '中央',
  end: '右',
}

const SIMPLE_COVER_WRITING_MODE_LABELS: Record<PageViewerReadingSimpleCoverWritingMode, string> = {
  inherit: '本文に従う',
  'vertical-rl': '縦書き',
  'horizontal-tb': '横書き',
}

const SIMPLE_COVER_LAYOUT_LABELS: Record<PageViewerReadingSimpleCoverLayout, string> = {
  normal: '標準',
  center: '中央',
}

const FURNITURE_CONTENT_LABELS: Record<PageViewerReadingHeaderContent, string> = {
  title: 'タイトル',
  'title-author': 'タイトルと著者',
}

/**
 * Reader Chrome (overlay 化): header auto-hide の再表示後、操作が無ければ
 * 隠すまでの猶予。header 自身は viewport 上の `position: absolute` overlay
 * であり、本文の layout 領域を一切占有しない — hidden 中は `transform` で
 * header 全体を上方向へ退避するだけで、body/frame の寸法、column metrics
 * (pitch/pageCount/現在ページ) には一切影響しない。
 */
const HEADER_AUTO_HIDE_DELAY_MS = 2500

type Props = {
  payloadId: string
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; payload: PageViewerSnapshotPayload; viewModel: PageViewModel }

const DEFAULT_PAGE_VIEWER_FONT_FAMILY = 'var(--font-stack-mincho)'
const EMPTY_PAGE_VIEW_ITEMS: readonly PageViewItem[] = []

/**
 * payload の表示設定 snapshot を CSS variables へ変換する。色 (`pageColor` /
 * `textColor` / `headingColor`) は PV-COL-12 の reader theme (session-only、
 * `pageViewerReaderTheme.ts`) で解決済みの値を受け取る — `document` (文書テーマ
 * 追従) 選択時は payload 由来、それ以外は既存プリセットなので、ここでは
 * derivation を一切分岐せず `deriveDocThemeTokens()` (本文 `.editor-panel` と
 * 同じ derivation、既存エディタと同じ配色になる) に渡すだけにする。
 * フォント関連 (`fontFamily` / `fontSize` / `lineHeight`) は reader theme の
 * 対象外 (依頼の 4 択は色のみ) なので、従来どおり payload から直接読む。
 * 省略時は `settings/defaults.ts` の既定値にフォールバックする (open 時点の
 * snapshot なので以降の Display Settings 変更を追いかける必要はない)。
 */
function buildPageViewerStyleVars(
  payload: PageViewerSnapshotPayload,
  themeColors: { pageColor: string; textColor: string; headingColor: string },
): CSSProperties {
  const tokens = deriveDocThemeTokens(themeColors)
  const fontFamily = payload.fontFamily ?? DEFAULT_PAGE_VIEWER_FONT_FAMILY
  const headingDividerLevels = payload.headingDividerLevels ?? DEFAULT_DISPLAY_SETTINGS.headingDividerLevels
  return {
    ...tokens,
    ...buildPageViewerUiThemeStyleVars(payload.uiTheme),
    '--pv-font-family': fontFamily,
    '--pv-font-size': `${payload.fontSize ?? DEFAULT_DISPLAY_SETTINGS.fontSize}px`,
    '--pv-line-height': `${payload.lineHeight ?? DEFAULT_DISPLAY_SETTINGS.lineHeight}`,
    // PV-SET-1A: 見出し / ルビの shared appearance snapshot (Display Settings と parity)。
    '--pv-heading-font-family': payload.headingFontFamily ?? fontFamily,
    '--pv-heading-margin-after': `${payload.headingMarginAfter ?? DEFAULT_DISPLAY_SETTINGS.headingMarginAfter}em`,
    '--pv-heading-divider-h1': headingDividerLevels.h1 ? '1' : '0',
    '--pv-heading-divider-h2': headingDividerLevels.h2 ? '1' : '0',
    '--pv-heading-divider-h3': headingDividerLevels.h3 ? '1' : '0',
    '--pv-heading-divider-h4': headingDividerLevels.h4 ? '1' : '0',
    '--pv-heading-divider-h5': headingDividerLevels.h5 ? '1' : '0',
    '--pv-heading-divider-h6': headingDividerLevels.h6 ? '1' : '0',
    '--pv-heading-align-h': payload.headingAlignHorizontal ?? DEFAULT_DISPLAY_SETTINGS.headingAlignHorizontal,
    '--pv-heading-align-v': payload.headingAlignVertical ?? DEFAULT_DISPLAY_SETTINGS.headingAlignVertical,
    '--pv-ruby-size': `${payload.rubySize ?? DEFAULT_DISPLAY_SETTINGS.rubySize}em`,
  } as CSSProperties
}

/**
 * PV-COL-15: 起動元メインアプリの UI theme snapshot (`payload.uiTheme`、
 * `pageViewerUiTheme.ts`) を header chrome 専用の `--pv-ui-*` CSS variables
 * へ変換する。既存の Reader theme 変数 (`--bg-surface` 等、上の
 * `deriveDocThemeTokens()` が返すもの) とは完全に別名前空間にしてあるため、
 * header だけが新しい token を参照し、本文 / outline panel / scrubber /
 * TOC / code block は今までどおり Reader theme のまま変わらない。
 * `uiTheme` 省略時は空オブジェクト — CSS 側の
 * `var(--pv-ui-*, <既存 chrome token>)` フォールバックへ倒れ、見た目は
 * PV-COL-13 までの chrome 配色のまま (後方互換)。
 */
function buildPageViewerUiThemeStyleVars(uiTheme: PageViewerUiThemeSnapshot | undefined): CSSProperties {
  if (!uiTheme) return {}
  return {
    '--pv-ui-header-bg': uiTheme.headerBackground,
    '--pv-ui-header-border': uiTheme.headerBorder,
    '--pv-ui-text-primary': uiTheme.textPrimary,
    '--pv-ui-button-hover-bg': uiTheme.buttonHoverBackground,
    '--pv-ui-button-hover-border': uiTheme.buttonHoverBorder,
    '--pv-ui-accent': uiTheme.accent,
    '--pv-ui-tooltip-bg': uiTheme.tooltipBackground,
    '--pv-ui-separator': uiTheme.separator,
  } as CSSProperties
}

export function PageViewerWindowRoot({ payloadId }: Props) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    setState({ kind: 'loading' })
    void (async () => {
      const bridge = window.nyozeBridge?.pageViewer?.getSnapshot
      const payload = bridge ? await bridge(payloadId) : null
      if (cancelled) return
      if (!payload) {
        setState({ kind: 'error' })
        return
      }
      try {
        const viewModel = buildPageViewModelFromSnapshot(payload)
        if (cancelled) return
        setState({ kind: 'ready', payload, viewModel })
      } catch {
        if (!cancelled) setState({ kind: 'error' })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [payloadId])

  // PV-COL-12: reader theme / 書字方向は「この viewer window だけの一時 state」
  // (session-only)。`settings.json` / frontmatter / snapshot payload は書き換え
  // ない。`null` (override 未設定) のときは payload 由来の値を使う ─ こうすると
  // 「viewer を閉じて開き直す」だけでなく、同じ window が新しい snapshot で
  // 差し替えられた場合 (`payloadId` 変化、"reuses one BrowserWindow" の既存挙動)
  // も、次の effect で override をリセットし、新しい文書自身の設定へ戻る。
  const [readerTheme, setReaderTheme] = useState<PageViewerReaderTheme>(DEFAULT_PAGE_VIEWER_READER_THEME)
  const [writingModeOverride, setWritingModeOverride] = useState<WritingMode | null>(null)
  useEffect(() => {
    setReaderTheme(DEFAULT_PAGE_VIEWER_READER_THEME)
    setWritingModeOverride(null)
  }, [payloadId])

  // PV-SET-4A: 見出し前改ページは persistent (settings.json) だが、この
  // Viewer 自身の歯車 popover から変更した場合だけ即時反映する。`null`
  // (未変更) のときは open-time snapshot (`payload.pageViewerBreakBeforeHeading*`)
  // の値をそのまま使う。readerTheme と同じ理由で、`payloadId` が変わったら
  // (新しい snapshot に差し替わったら) override をリセットし、新しい snapshot
  // 自身の値へ戻る（古い Viewer の一時変更を次の文書へ持ち越さない）。
  const [headingPageBreakOverride, setHeadingPageBreakOverride] = useState<{
    enabled: boolean
    maxLevel: number
  } | null>(null)
  useEffect(() => {
    setHeadingPageBreakOverride(null)
  }, [payloadId])

  // PV-READ-1 / PV-READ-2: 読書面余白・用紙枠・furniture。永続 key だが、
  // この Viewer 自身の歯車で変更したときだけ local override で即時反映する。
  // payloadId 差し替えで破棄。
  const [readingSurfaceOverride, setReadingSurfaceOverride] = useState<ReadingSurfaceOverride | null>(null)
  useEffect(() => {
    setReadingSurfaceOverride(null)
  }, [payloadId])

  // PV-COL-16: ページ遷移アニメーションの mode / speed も同じ session-only
  // Reader Control。settings.json / frontmatter / snapshot payload / IPC へは
  // 永続化しない。「閉じて開き直す」(新規 mount) と「同じ window の snapshot
  // 差し替え」(payloadId 変化) の両方で既定の `fade` / `500ms` へ戻る
  // (PV-COL-12 の reset と同じ扱い。既存 reset effect の regex を固定している
  // wiring test を保つため、reset は独立した effect として並置する)。
  // speed (第2次 follow-up の slider) は mode と同じ effect でリセットする —
  // この effect 自体が PV-COL-16 独自のもので、PV-COL-12 側の regex 制約は
  // 受けない。
  const [pageTurnTransition, setPageTurnTransition] = useState<PageViewerPageTurnTransition>(
    DEFAULT_PAGE_VIEWER_PAGE_TURN_TRANSITION,
  )
  const [pageTurnSpeedMs, setPageTurnSpeedMs] = useState<number>(DEFAULT_PAGE_VIEWER_PAGE_TURN_SPEED_MS)
  useEffect(() => {
    setPageTurnTransition(DEFAULT_PAGE_VIEWER_PAGE_TURN_TRANSITION)
    setPageTurnSpeedMs(DEFAULT_PAGE_VIEWER_PAGE_TURN_SPEED_MS)
  }, [payloadId])

  // 選択中の reader theme を実色へ解決する。`document` (文書テーマ追従) は
  // payload の `pageColor`/`textColor`/`headingColor` (省略時は既定文書配色) を
  // 使い、それ以外は既存プリセットをそのまま使う (`pageViewerReaderTheme.ts`)。
  const readerThemeColors = useMemo(
    () => (state.kind === 'ready' ? resolvePageViewerReaderThemeColors(readerTheme, state.payload) : null),
    [state, readerTheme],
  )

  // Hooks must run unconditionally on every render, so this is computed
  // before the loading/error early returns below (`state.kind !== 'ready'`
  // just falls back to `undefined`, leaving the status divs unstyled).
  // PV-READ-1: 読書面の実効余白 / paper outer も同じ styleVars へ載せる。
  const readingSurfaceGeometry = useMemo(() => {
    const payload = state.kind === 'ready' ? state.payload : null
    return resolvePageViewerReadingSurfaceGeometry({
      marginTop: readingSurfaceOverride?.marginTop ?? payload?.pageViewerReadingMarginTop,
      marginBottom: readingSurfaceOverride?.marginBottom ?? payload?.pageViewerReadingMarginBottom,
      marginInline: readingSurfaceOverride?.marginInline ?? payload?.pageViewerReadingMarginInline,
      paperFrame: readingSurfaceOverride?.paperFrame ?? payload?.pageViewerReadingPaperFrame,
    })
  }, [state, readingSurfaceOverride])

  const readingFurniture = useMemo(() => {
    const payload = state.kind === 'ready' ? state.payload : null
    return resolvePageViewerReadingFurnitureSettings({
      headerEnabled: readingSurfaceOverride?.headerEnabled ?? payload?.pageViewerReadingHeaderEnabled,
      headerAlign: readingSurfaceOverride?.headerAlign ?? payload?.pageViewerReadingHeaderAlign,
      headerContent: readingSurfaceOverride?.headerContent ?? payload?.pageViewerReadingHeaderContent,
      footerEnabled: readingSurfaceOverride?.footerEnabled ?? payload?.pageViewerReadingFooterEnabled,
      footerAlign: readingSurfaceOverride?.footerAlign ?? payload?.pageViewerReadingFooterAlign,
    })
  }, [state, readingSurfaceOverride])

  // PV-READ-3B: ON/OFFだけがPageModelのcompositionを変える。書字方向・layoutは
  // fixed cover rendererだけが読み、CSS Columnsのmeasure / ratio restoreへは入れない。
  const readingSimpleCover = useMemo(() => {
    const payload = state.kind === 'ready' ? state.payload : null
    return {
      enabled: normalizePageViewerReadingSimpleCoverEnabled(
        readingSurfaceOverride?.simpleCoverEnabled ?? payload?.pageViewerReadingSimpleCoverEnabled,
      ),
      writingMode: normalizePageViewerReadingSimpleCoverWritingMode(
        readingSurfaceOverride?.simpleCoverWritingMode ?? payload?.pageViewerReadingSimpleCoverWritingMode,
      ),
      layout: normalizePageViewerReadingSimpleCoverLayout(
        readingSurfaceOverride?.simpleCoverLayout ?? payload?.pageViewerReadingSimpleCoverLayout,
      ),
    }
  }, [state, readingSurfaceOverride])

  const styleVars = useMemo(() => {
    if (state.kind !== 'ready' || !readerThemeColors) return undefined
    const base = buildPageViewerStyleVars(state.payload, readerThemeColors)
    return {
      ...base,
      '--pv-reading-margin-top': `${readingSurfaceGeometry.effectiveTop}px`,
      '--pv-reading-margin-bottom': `${readingSurfaceGeometry.effectiveBottom}px`,
      '--pv-reading-margin-inline': `${readingSurfaceGeometry.effectiveInline}px`,
      '--pv-reading-paper-outer-top': `${readingSurfaceGeometry.paperOuterTop}px`,
      '--pv-reading-paper-outer-bottom': `${readingSurfaceGeometry.paperOuterBottom}px`,
      '--pv-reading-paper-outer-inline': `${readingSurfaceGeometry.paperOuterInline}px`,
    } as CSSProperties
  }, [state, readerThemeColors, readingSurfaceGeometry])

  // 本文 surface (keyboard focus 対象)。内部では flow/synthetic section ごとの
  // page-frame と fixed blank page-frame を重ね、page sequence で active item
  // だけを可視化する。
  const bodyRef = useRef<HTMLDivElement | null>(null)
  // PV-READ-2 follow-up: native traffic lights / window-controls 予約を
  // 読書面 furniture からも参照するため、window ルートへ platform と
  // reservation CSS 変数を載せる。
  const windowRootRef = useRef<HTMLDivElement | null>(null)
  const viewerPlatform = useMemo(() => detectRuntimePlatform(), [])
  const [isScrubbing, setIsScrubbing] = useState(false)
  const isScrubbingRef = useRef(false)
  const activeScrubberPointerIdRef = useRef<number | null>(null)
  // pointerdown 時点の snap page。Playwright click 等の微小 pointermove で
  // 同じ page のまま suppress すると、click 用に開始した fade/zoom を即キャンセル
  // してしまうため、page が変わった drag だけ suppress する。
  const scrubberPointerDownPageRef = useRef<number | null>(null)
  // PV-COL-12: override が設定されていればそれを使う (toggleWritingMode で
  // 明示的に切り替えた値)。未設定 (`null`) なら従来どおり payload 由来。
  const writingMode: WritingMode =
    writingModeOverride ?? (state.kind === 'ready' ? (state.payload.writingMode ?? 'vertical-rl') : 'vertical-rl')

  // PV-SET-1B: open-time snapshot の auto TCY を effective writingMode で gate する。
  // Display Settings の live sync はしない。digit 正規化は Display Settings と同じ
  // `resolveAutoTcyDigitRange`（1..4 clamp、min>max なら swap）。
  const autoTcy: PageViewerAutoTcyRenderOptions | undefined = useMemo(() => {
    if (state.kind !== 'ready') return undefined
    const payload = state.payload
    const digitRange = resolveAutoTcyDigitRange({
      autoTcyMinDigits: payload.autoTcyMinDigits ?? DEFAULT_DISPLAY_SETTINGS.autoTcyMinDigits,
      autoTcyMaxDigits: payload.autoTcyMaxDigits ?? DEFAULT_DISPLAY_SETTINGS.autoTcyMaxDigits,
    })
    return {
      enabled: shouldEnableAutoTcyDisplay({
        autoTcyEnabled: payload.autoTcyEnabled ?? DEFAULT_DISPLAY_SETTINGS.autoTcyEnabled,
        writingMode,
      }),
      numbersOnly: resolveAutoTcyNumbersOnly({
        autoTcyNumbersOnly: payload.autoTcyNumbersOnly ?? DEFAULT_DISPLAY_SETTINGS.autoTcyNumbersOnly,
      }),
      minDigits: digitRange.minDigits,
      maxDigits: digitRange.maxDigits,
    }
  }, [state, writingMode])

  // PV-SET-2: role label 表示は PageModel ではなく renderer 側。open-time snapshot
  // のみ（Display Settings の live sync はしない）。
  const showRoleLabels = useMemo(() => {
    if (state.kind !== 'ready') return true
    return resolvePageViewerMetadataDisplay(state.payload).frontmatterShowRoleLabels
  }, [state])

  // PV-SET-4A / PV-READ-3B: 見出し前改ページ、または簡易表紙のON/OFFだけが
  // PageModel / PageViewModel を再構成する。override が `null` (未変更) の間は
  // 最初の loading effect で組み立てた `state.viewModel` をそのまま参照 (無駄な
  // 再構成をしない)。再構成すると `items` の参照が変わるため、下の
  // `usePageViewerPageSequence` の既存 reset effect (`[items]` 依存) が
  // 自動的に先頭ページへ戻す — 任意 scroll offset や比率復元は導入しない
  // (要件どおり、設定変更後は明示的に先頭へ戻す設計)。
  const viewModel = useMemo(() => {
    if (state.kind !== 'ready') return null
    const payloadCoverEnabled = normalizePageViewerReadingSimpleCoverEnabled(
      state.payload.pageViewerReadingSimpleCoverEnabled,
    )
    const coverEnabledChanged = readingSimpleCover.enabled !== payloadCoverEnabled
    if (!headingPageBreakOverride && !coverEnabledChanged) return state.viewModel
    try {
      return buildPageViewModelFromSnapshot({
        ...state.payload,
        pageViewerBreakBeforeHeading:
          headingPageBreakOverride?.enabled ?? state.payload.pageViewerBreakBeforeHeading,
        pageViewerBreakBeforeHeadingMaxLevel:
          headingPageBreakOverride?.maxLevel ?? state.payload.pageViewerBreakBeforeHeadingMaxLevel,
        pageViewerReadingSimpleCoverEnabled: readingSimpleCover.enabled,
      })
    } catch {
      return state.viewModel
    }
  }, [state, headingPageBreakOverride, readingSimpleCover.enabled])

  const sequenceItems = viewModel ? viewModel.items : EMPTY_PAGE_VIEW_ITEMS
  const flowSectionIds = useMemo(
    () => sequenceItems.filter((item) => item.kind === 'flow' || item.kind === 'synthetic').map((item) => item.sectionId),
    [sequenceItems],
  )
  const {
    sequence,
    activeLocation,
    pageIndex,
    pageCount,
    flowPageCountRegistrationGeneration,
    setFlowPageCount,
    goToPage,
  } = usePageViewerPageSequence({ items: sequenceItems })

  // PV-COL-14 / PV-COL-16: ユーザー操作による page index 変化だけ、選択中の
  // transition (`none` / `fade` / `slide` / `zoom`) を animate する。
  // writing-mode 進捗復元・resize clamp・初期表示は `pageTurnPendingDirectionRef`
  // を立てない raw `goToPage` / sequence 内部更新のままなので animate しない。
  // `key={pageIndex}` による remount はしない (column layout cache を壊さない)。
  //
  // 第3次 follow-up: animation 対象は 3 要素になった。`pageStageRef` (本文
  // 表示層、fade の 2 フェーズ・zoom を担う)、`pageTurnMaskRef` (`.content`
  // 全体を覆う不透明 layer、slide 専用)、`pageTurnOverlayRef` (同じ範囲を
  // 覆う半透明 layer、slide 専用、mask の前面)。
  //
  // `pageIndexSeenRef` は「直近に受理した navigation target」(および raw move
  // 後の committed pageIndex) を持つ。render 時の追従だけに頼ると、scrubber
  // drag などで再描画前に同一 page を連続要求したとき `goToPage` が no-op でも
  // pending が再武装し、後続の writing-mode 復元 / clamp で誤発火する。
  // 受理した target は即時に ref へ書き、`shouldTriggerPageTurnTransition` で
  // 判定する。
  const pageStageRef = useRef<HTMLDivElement | null>(null)
  const pageTurnMaskRef = useRef<HTMLDivElement | null>(null)
  const pageTurnOverlayRef = useRef<HTMLDivElement | null>(null)
  // `slide` / `zoom` / reduced-motion 下の `fade` など、page index が
  // *既に* 切り替わった直後に post-hoc で animate する mode 専用。論理方向
  // (`next` / `previous`) を持ち、slide の direction data attribute
  // (見た目専用、mask/overlay 要素へ付与) にだけ使う。
  const pageTurnPendingDirectionRef = useRef<PageTurnDirection | null>(null)
  // 第3次 follow-up: `fade` だけは page index の切替そのものを fade-out
  // 完了まで遅延させる (旧ページが fade-out の間、見え続けている必要が
  // あるため — Tategaki 参考実装と同じ「fade-out → 切替 → fade-in」の
  // 二相)。`pageTurnPendingFadeInRef` は「直後の pageIndex commit が
  // fade-out 完了による遅延切替である (=fade-in フェーズを開始すべき)」
  // ことを、下の `useLayoutEffect` へ伝える。`pageTurnPendingDirectionRef`
  // とは互いに排他 (同時に立つことはない)。
  const pageTurnPendingFadeInRef = useRef(false)
  // 進行中の fade-out がまだ確定していない移動先。「なし」を選んだ瞬間の
  // cleanup effect が「アニメーションは止めるが、要求されたページ移動
  // そのものは無かったことにしない (silently drop しない)」ために使う —
  // snapshot 差し替え・unmount では逆にこの値ごと破棄する (別文書の
  // page index を持ち越す意味が無いため)。
  const pageTurnPendingFadeTargetRef = useRef<number | null>(null)
  const pageTurnCleanupRef = useRef<(() => void) | null>(null)
  // fade-out の完了コールバック (`animationend` / fallback timer 経由、
  // `beginPageTurnFadeOutPhase()` 参照) が、呼ばれた時点で既に古い遷移に
  // なっていないかを確認するための世代トークン。連続ページ送り・mode 変更
  // (「なし」選択)・snapshot 差し替え・unmount のいずれでも 1 ずつ進める。
  // `beginPageTurnFadeOutPhase()` 自身が返す `cancel()` (`pageTurnCleanupRef`
  // 経由で必ず呼ぶ) が主たる無効化手段だが、この世代チェックは「万一
  // cleanup 呼び出しの経路に漏れがあっても、古い fade-out 完了が新しい
  // 遷移へ干渉しない」ための保護層 (belt-and-suspenders)。
  const pageTurnFadeGenerationRef = useRef(0)
  const pageIndexSeenRef = useRef(pageIndex)
  // goToPage 完了判定用。fade-out 正常完了時に既に committed だと
  // setState が no-op になり、fade-in を起動する useLayoutEffect が走らない。
  const pageIndexCommittedRef = useRef(pageIndex)
  pageIndexCommittedRef.current = pageIndex

  // speed slider (第2次 follow-up): 変更は次のページ遷移から適用すればよく、
  // 実行中の animation をこの値の変化だけで再始動してはいけない。そのため
  // `pageTurnSpeedMs` を下の `useLayoutEffect` の依存配列に含めず、ref 経由で
  // 「開始する瞬間の最新値」だけを読む。
  const pageTurnSpeedMsRef = useRef(pageTurnSpeedMs)
  useEffect(() => {
    pageTurnSpeedMsRef.current = pageTurnSpeedMs
  }, [pageTurnSpeedMs])

  const navigateToPage = useCallback(
    (nextPageIndex: number, options?: { suppressTransition?: boolean }) => {
      const clamped = clampPageIndex(nextPageIndex, pageCount)
      // scrubber の drag preview は連続的な page-index 更新が必要なので、
      // 既定の fade 遅延切替を挟まない。進行中の page-turn があれば破棄して
      // 即時 goToPage する (keyboard / TOC / outline / scrubber click は
      // 従来どおり transition 経由)。
      if (options?.suppressTransition) {
        pageTurnFadeGenerationRef.current += 1
        pageTurnCleanupRef.current?.()
        pageTurnCleanupRef.current = null
        pageTurnPendingFadeTargetRef.current = null
        pageTurnPendingFadeInRef.current = false
        pageTurnPendingDirectionRef.current = null
        const stage = pageStageRef.current
        const mask = pageTurnMaskRef.current
        const overlay = pageTurnOverlayRef.current
        if (stage && mask && overlay) clearPageTurnTransitionElements({ stage, mask, overlay })
        pageIndexSeenRef.current = clamped
        goToPage(clamped)
        return
      }
      const trigger = shouldTriggerPageTurnTransition({
        previousPageIndex: pageIndexSeenRef.current,
        nextPageIndex: clamped,
        suppress: false,
      })
      if (!trigger) {
        // 同一 target の再要求で pending を立て直さないよう、受理値を即時反映する。
        pageIndexSeenRef.current = clamped
        // 同 target の deferred fade-out 中は完了側に切替を任せる (早期 goToPage は no-op 化して opacity 0 が残る)。
        if (pageTurnPendingFadeTargetRef.current === clamped) return
        goToPage(clamped)
        return
      }
      const direction = resolvePageTurnDirection(pageIndexSeenRef.current, clamped)
      pageIndexSeenRef.current = clamped

      // `fade` だけは page index の切替自体を fade-out 完了まで遅らせる
      // (旧ページが fade-out の間、見え続けている必要があるため)。他の
      // mode / reduced-motion / stage 未マウントは従来どおり即時切替。
      if (pageTurnTransition === 'fade' && !prefersReducedMotion() && pageStageRef.current) {
        pageTurnFadeGenerationRef.current += 1
        const myGeneration = pageTurnFadeGenerationRef.current
        pageTurnCleanupRef.current?.()
        // 直前の fade-out 完了が立てた pendingFadeIn が、この新しい fade-out
        // を useLayoutEffect 側でキャンセルしてしまわないよう消す。
        pageTurnPendingFadeInRef.current = false
        pageTurnPendingFadeTargetRef.current = clamped
        pageTurnCleanupRef.current = beginPageTurnFadeOutPhase(
          { stage: pageStageRef.current },
          {
            totalDurationMs: resolvePageTurnTransitionDurationMs('fade', pageTurnSpeedMsRef.current),
            onFadeOutComplete: () => {
              if (pageTurnFadeGenerationRef.current !== myGeneration) {
                // 正常完了は class を残すため、世代不一致 (cancel が
                // settled 後に no-op になった場合) ではここで剥がす。
                pageStageRef.current?.classList.remove(PAGE_VIEWER_PAGE_TURN_FADE_OUT_CLASS)
                return
              }
              pageTurnCleanupRef.current = null
              pageTurnPendingFadeTargetRef.current = null
              pageTurnPendingFadeInRef.current = true
              const alreadyCommitted = pageIndexCommittedRef.current === clamped
              goToPage(clamped)
              // goToPage が no-op だと pageIndex 依存の useLayoutEffect が
              // 走らず、fade-out class が opacity 0 のまま残る。その場合だけ
              // ここで fade-in へ置換する (通常は useLayoutEffect が担う)。
              if (alreadyCommitted && pageTurnPendingFadeInRef.current) {
                pageTurnPendingFadeInRef.current = false
                const stage = pageStageRef.current
                if (stage) {
                  pageTurnCleanupRef.current = beginPageTurnFadeInPhase(
                    { stage },
                    {
                      totalDurationMs: resolvePageTurnTransitionDurationMs(
                        'fade',
                        pageTurnSpeedMsRef.current,
                      ),
                    },
                  )
                }
              }
            },
          },
        )
        return
      }

      pageTurnPendingDirectionRef.current = direction
      goToPage(clamped)
    },
    [goToPage, pageCount, pageTurnTransition],
  )

  const navigateByPage = useCallback(
    (direction: PageMoveDirection) => {
      const delta = direction === 'next' ? 1 : -1
      navigateToPage(pageIndexSeenRef.current + delta)
    },
    [navigateToPage],
  )

  useEffect(() => {
    return () => {
      pageTurnFadeGenerationRef.current += 1
      pageTurnCleanupRef.current?.()
      pageTurnCleanupRef.current = null
    }
  }, [])

  // PV-COL-16 follow-up (レビュー指摘): 進行中の transition の最中に「なし」
  // を選ぶと、`pageIndex` が変わらない限り上の `useLayoutEffect` は発火しない
  // ため、実行中の class / timer が duration 分残ってしまう回帰があった。
  // `pageTurnTransition` が `none` になった瞬間、専用の effect で即時に
  // cleanup する。第3次 follow-up: `fade` の deferred switch (まだ page
  // index を切り替えていない fade-out) が進行中だった場合、アニメーションは
  // 中断するが、要求されていたページ移動そのものは無かったことにしない —
  // 中断した fade-out の行き先へアニメーション無しで即座に切り替える
  // (「入力を silently drop しない」という要件)。
  useEffect(() => {
    if (pageTurnTransition !== 'none') return
    pageTurnFadeGenerationRef.current += 1
    pageTurnCleanupRef.current?.()
    pageTurnCleanupRef.current = null
    pageTurnPendingDirectionRef.current = null
    pageTurnPendingFadeInRef.current = false
    const pendingFadeTarget = pageTurnPendingFadeTargetRef.current
    pageTurnPendingFadeTargetRef.current = null
    const stage = pageStageRef.current
    const mask = pageTurnMaskRef.current
    const overlay = pageTurnOverlayRef.current
    if (stage && mask && overlay) clearPageTurnTransitionElements({ stage, mask, overlay })
    if (pendingFadeTarget !== null) goToPage(pendingFadeTarget)
  }, [pageTurnTransition, goToPage])

  // PV-COL-16 follow-up: snapshot replacement (`payloadId` 変更) は viewer
  // window を unmount しない (同じ window / 同じ page-stage・mask・overlay
  // DOM ノードを再利用する、"reuses one BrowserWindow" の既存挙動)。その
  // ため、直前の文書で animation が進行中のまま新しい payload/viewModel へ
  // 差し替わると、旧 snapshot 由来の transition class / timer が新しい
  // 文書の初期表示へ持ち越されてしまう。payloadId が変わるたびに明示的に
  // cleanup する。第3次 follow-up: 進行中だった fade の deferred switch は
  // (「なし」選択とは異なり) 破棄する — 旧文書の page index は新しい
  // pageCount の下では意味を持たないため、flush はしない。
  useEffect(() => {
    pageTurnFadeGenerationRef.current += 1
    pageTurnCleanupRef.current?.()
    pageTurnCleanupRef.current = null
    pageTurnPendingDirectionRef.current = null
    pageTurnPendingFadeInRef.current = false
    pageTurnPendingFadeTargetRef.current = null
    const stage = pageStageRef.current
    const mask = pageTurnMaskRef.current
    const overlay = pageTurnOverlayRef.current
    if (stage && mask && overlay) clearPageTurnTransitionElements({ stage, mask, overlay })
  }, [payloadId])

  useLayoutEffect(() => {
    const pendingFadeIn = pageTurnPendingFadeInRef.current
    pageTurnPendingFadeInRef.current = false
    const pendingDirection = pageTurnPendingDirectionRef.current
    pageTurnPendingDirectionRef.current = null
    // raw goToPage / clamp 後も seen cursor を committed pageIndex に揃える。
    pageIndexSeenRef.current = pageIndex

    if (pendingFadeIn) {
      // fade-out 完了による遅延切替の直後。完了コールバックの発火後・この
      // コミットまでの間に mode が `fade` から変わっていた場合は、切替だけ
      // 済ませて何も animate しない (「なし」中は既に専用 effect が
      // cleanup 済みなので、ここへは通常到達しない)。
      if (pageTurnTransition !== 'fade' || prefersReducedMotion()) {
        // 正常完了で残している fade-out class (opacity 0) をここで剥がす。
        pageStageRef.current?.classList.remove(PAGE_VIEWER_PAGE_TURN_FADE_OUT_CLASS)
        return
      }
      const stage = pageStageRef.current
      if (!stage) return
      pageTurnCleanupRef.current?.()
      pageTurnCleanupRef.current = beginPageTurnFadeInPhase(
        { stage },
        { totalDurationMs: resolvePageTurnTransitionDurationMs('fade', pageTurnSpeedMsRef.current) },
      )
      return
    }

    if (!pendingDirection) return
    // 'none' は class を付けず、既存 navigation をそのまま通す (PV-COL-16)。
    // `fade` はこの post-hoc 経路を使わない (reduced-motion 下の即時切替
    // だけが pendingDirection 経由で 'fade' になり得るが、その場合は次の
    // `prefersReducedMotion()` 早期 return で弾かれる — 防御的に明示除外)。
    if (pageTurnTransition === 'none' || pageTurnTransition === 'fade') return
    if (prefersReducedMotion()) return
    const stage = pageStageRef.current
    const mask = pageTurnMaskRef.current
    const overlay = pageTurnOverlayRef.current
    if (!stage || !mask || !overlay) return
    pageTurnCleanupRef.current?.()
    pageTurnCleanupRef.current = restartPageTurnTransitionAnimation(
      { stage, mask, overlay },
      {
        transition: pageTurnTransition,
        direction: pendingDirection,
        // 実行中の animation を speed 変更だけで再始動しないよう、ここでは
        // ref 経由で「開始する瞬間の最新値」だけを読む
        // (`pageTurnSpeedMs` 自体は依存配列に含めない)。
        speedMs: pageTurnSpeedMsRef.current,
      },
    )
    // `pageTurnTransition` は依存に含めるが、選択変更そのもの (pageIndex 不変)
    // では pending が null なので animation は起動しない。
  }, [pageIndex, pageTurnTransition])

  // PV-COL-12: 書字方向切替時の進捗維持。旧 scroll offset や任意 transform
  // offset、古い pageCount による clamp は使わない。切替前の正規化進捗率
  // (`pageIndex / maxPageIndex`、scrubber と同じ `progressRatioForPageIndex`)
  // を記録しておき、CSS Columns の再計測 (writingMode 変更は各
  // `usePageViewerColumnLayout` の measure 依存に既に含まれるため、既存の
  // resize と同じ経路で自動的に再計測される) が確定させた新しい pageCount に
  // 対して同じ比率の page index へ復元する。`pageIndexFromProgressRatio` は
  // ratio=0 → 常に page 0、ratio=1 → 常に最終 page を返すため、再計測が
  // 複数段階 (documentInfo/TOC 等の他 section の分も含む) で確定するとしても
  // 先頭・末尾の保持だけは常に正しい。
  const pendingWritingModeProgressRef = useRef<number | null>(null)
  // PV-READ-1: reading-surface reflowはwriting modeのratioと状態を共有しない。
  // 各flowが新generationで実frameをmeasureしたことを確認してから、global
  // page sequence更新後のlayout effectで一度だけratioを消費する。
  const pendingReadingSurfaceReflowRef = useRef<{
    generation: number
    ratio: number
    awaitingSectionIds: Set<string>
  } | null>(null)
  const [readingSurfaceReflowGeneration, setReadingSurfaceReflowGeneration] = useState(0)
  const readingSurfaceReflowGenerationRef = useRef(0)
  const [readingSurfaceReflowReadyGeneration, setReadingSurfaceReflowReadyGeneration] = useState<number | null>(null)

  const discardReadingSurfaceReflow = useCallback(() => {
    pendingReadingSurfaceReflowRef.current = null
    setReadingSurfaceReflowReadyGeneration(null)
  }, [])

  const acknowledgeReadingSurfaceMeasure = useCallback((sectionId: string, generation: number) => {
    const pending = pendingReadingSurfaceReflowRef.current
    if (!pending || pending.generation !== generation) return
    pending.awaitingSectionIds.delete(sectionId)
    if (pending.awaitingSectionIds.size === 0) {
      setReadingSurfaceReflowReadyGeneration(generation)
    }
  }, [])

  useEffect(() => {
    discardReadingSurfaceReflow()
  }, [payloadId, discardReadingSurfaceReflow])

  useEffect(() => {
    return () => {
      pendingReadingSurfaceReflowRef.current = null
    }
  }, [])

  useLayoutEffect(() => {
    const pending = pendingReadingSurfaceReflowRef.current
    if (!pending || readingSurfaceReflowReadyGeneration !== pending.generation) return
    const ratio = pending.ratio
    pendingReadingSurfaceReflowRef.current = null
    setReadingSurfaceReflowReadyGeneration(null)
    goToPage(pageIndexFromProgressRatio(ratio, pageCount))
  }, [readingSurfaceReflowReadyGeneration, pageCount, goToPage])

  const toggleWritingMode = useCallback(() => {
    discardReadingSurfaceReflow()
    pendingWritingModeProgressRef.current = progressRatioForPageIndex(pageIndex, pageCount)
    setWritingModeOverride(writingMode === 'vertical-rl' ? 'horizontal-tb' : 'vertical-rl')
    // header 内のボタンに focus が残ると `:focus-within` で auto-hide が
    // 止まり続ける (outline toggle の P2 修正と同じ理由)。
    bodyRef.current?.focus()
  }, [pageIndex, pageCount, writingMode, discardReadingSurfaceReflow])

  useEffect(() => {
    if (pendingWritingModeProgressRef.current === null) return
    const ratio = pendingWritingModeProgressRef.current
    pendingWritingModeProgressRef.current = null
    goToPage(pageIndexFromProgressRatio(ratio, pageCount))
  }, [pageCount, goToPage])

  // 安全弁: 両 writing mode で pageCount が変わらない文書では上の pageCount
  // effect が発火しない。単一 rAF だと CSS Columns 再計測より先に pending を
  // 捨ててしまい中間ページの比率復元が消えるため、writingMode 確定後に
  // double-rAF で「まだ未消費なら現在の pageCount で一度適用して閉じる」。
  useEffect(() => {
    if (pendingWritingModeProgressRef.current === null) return
    const ratio = pendingWritingModeProgressRef.current
    let alive = true
    let innerRaf = 0
    const outerRaf = window.requestAnimationFrame(() => {
      innerRaf = window.requestAnimationFrame(() => {
        if (!alive) return
        if (pendingWritingModeProgressRef.current !== ratio) return
        pendingWritingModeProgressRef.current = null
        goToPage(pageIndexFromProgressRatio(ratio, pageCount))
      })
    })
    return () => {
      alive = false
      window.cancelAnimationFrame(outerRaf)
      if (innerRaf) window.cancelAnimationFrame(innerRaf)
    }
  }, [writingMode, pageCount, goToPage])

  // PV-COL-12: テーマ dropdown。header アイコンボタンから開く軽量 custom menu。
  // menu は header overlay の子として DOM に置くため (要件)、trigger / popover
  // 内のどこを操作しても pointerdown/focus が header 要素までバブルし、既存の
  // `onPointerEnter`/`onPointerDown`/`onFocus`={revealHeader} が自然に発火する
  // ── outline panel (body 側の兄弟要素) のときのように専用の
  // `isHeaderChromeVisible` OR 条件を新設する必要はない (念のため下で追加する)。
  const [themeMenuOpen, setThemeMenuOpen] = useState(false)
  const themeMenuRootRef = useRef<HTMLDivElement | null>(null)

  const toggleThemeMenu = useCallback(() => {
    const next = !themeMenuOpen
    setThemeMenuOpen(next)
    if (!next) {
      bodyRef.current?.focus()
    }
  }, [themeMenuOpen])

  const selectReaderTheme = useCallback((theme: PageViewerReaderTheme) => {
    setReaderTheme(theme)
    setThemeMenuOpen(false)
    bodyRef.current?.focus()
  }, [])

  // Escape で閉じる (outline panel と同じ独立した経路)。
  useEffect(() => {
    if (!themeMenuOpen) return
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setThemeMenuOpen(false)
      bodyRef.current?.focus()
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [themeMenuOpen])

  // outside click でも閉じる (既存 custom listbox `ThemeSwatchSelect` の慣習)。
  // trigger 自身への pointerdown は `themeMenuRootRef` の内側なので無視され、
  // toggle 経路 (`toggleThemeMenu`) とは競合しない。
  useEffect(() => {
    if (!themeMenuOpen) return
    const handlePointerDown = (event: globalThis.PointerEvent) => {
      const root = themeMenuRootRef.current
      if (root && root.contains(event.target as Node)) return
      setThemeMenuOpen(false)
      bodyRef.current?.focus()
    }
    window.addEventListener('pointerdown', handlePointerDown)
    return () => window.removeEventListener('pointerdown', handlePointerDown)
  }, [themeMenuOpen])

  // PV-COL-16: ページ遷移 dropdown。テーマ dropdown と同じ軽量 custom listbox
  // パターン (header の DOM 子 / Escape / outside click / close 時の body focus
  // 復帰)。もう一方の menu trigger をクリックした場合は、この outside-click
  // listener が先に閉じるため、専用の相互排他制御は不要 (theme menu と同じ)。
  const [transitionMenuOpen, setTransitionMenuOpen] = useState(false)
  const transitionMenuRootRef = useRef<HTMLDivElement | null>(null)

  const toggleTransitionMenu = useCallback(() => {
    const next = !transitionMenuOpen
    setTransitionMenuOpen(next)
    if (!next) {
      bodyRef.current?.focus()
    }
  }, [transitionMenuOpen])

  const selectPageTurnTransition = useCallback((transition: PageViewerPageTurnTransition) => {
    setPageTurnTransition(transition)
    setTransitionMenuOpen(false)
    bodyRef.current?.focus()
  }, [])

  // 第2次 follow-up: speed slider (`<input type="range">`)。listbox の
  // option とは違い、ドラッグ中に menu を閉じたり focus を奪ったりしない
  // (range 入力は自分自身が focus を保持し続ける必要がある)。値は次の
  // ページ遷移から使われるだけで、実行中の animation を再始動しない
  // (`pageTurnSpeedMsRef` 経由で参照される)。
  const handlePageTurnSpeedChange = useCallback((value: number) => {
    setPageTurnSpeedMs(normalizePageTurnSpeedMs(value))
  }, [])

  // Escape で閉じる (theme menu と同じ独立した経路)。
  useEffect(() => {
    if (!transitionMenuOpen) return
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setTransitionMenuOpen(false)
      bodyRef.current?.focus()
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [transitionMenuOpen])

  // outside click でも閉じる (theme menu と同じ慣習)。
  useEffect(() => {
    if (!transitionMenuOpen) return
    const handlePointerDown = (event: globalThis.PointerEvent) => {
      const root = transitionMenuRootRef.current
      if (root && root.contains(event.target as Node)) return
      setTransitionMenuOpen(false)
      bodyRef.current?.focus()
    }
    window.addEventListener('pointerdown', handlePointerDown)
    return () => window.removeEventListener('pointerdown', handlePointerDown)
  }, [transitionMenuOpen])

  // PV-SET-4A: Page Viewer Settings popover (歯車アイコン)。テーマ / ページ遷移
  // dropdown と同じ軽量 custom popover パターン (Escape / outside click /
  // close 時の body focus 復帰)。中身は persistent setting (見出しの前で
  // 改ページ / 対象見出しレベル) の compact な section だけを持つ。
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false)
  const settingsMenuRootRef = useRef<HTMLDivElement | null>(null)

  const toggleSettingsMenu = useCallback(() => {
    const next = !settingsMenuOpen
    setSettingsMenuOpen(next)
    if (!next) {
      bodyRef.current?.focus()
    }
  }, [settingsMenuOpen])

  // Escape で閉じる (theme menu / transition menu と同じ独立した経路)。
  useEffect(() => {
    if (!settingsMenuOpen) return
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setSettingsMenuOpen(false)
      bodyRef.current?.focus()
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [settingsMenuOpen])

  // outside click でも閉じる (theme menu / transition menu と同じ慣習)。
  useEffect(() => {
    if (!settingsMenuOpen) return
    const handlePointerDown = (event: globalThis.PointerEvent) => {
      const root = settingsMenuRootRef.current
      if (root && root.contains(event.target as Node)) return
      setSettingsMenuOpen(false)
      bodyRef.current?.focus()
    }
    window.addEventListener('pointerdown', handlePointerDown)
    return () => window.removeEventListener('pointerdown', handlePointerDown)
  }, [settingsMenuOpen])

  // 現在有効な値: この Viewer 自身が popover で変更していればその override、
  // なければ open-time snapshot (`payload.pageViewerBreakBeforeHeading*`) を
  // 正規化した値。settings.json の既定 (`normalizePageViewerBreakBeforeHeading*`)
  // と同じ fallback 規則を使う。
  const headingPageBreakEnabled =
    headingPageBreakOverride?.enabled ??
    (state.kind === 'ready' ? normalizePageViewerBreakBeforeHeading(state.payload.pageViewerBreakBeforeHeading) : false)
  const headingPageBreakMaxLevel =
    headingPageBreakOverride?.maxLevel ??
    normalizePageViewerBreakBeforeHeadingMaxLevel(
      state.kind === 'ready' ? state.payload.pageViewerBreakBeforeHeadingMaxLevel : undefined,
    )

  // 変更は (1) この Viewer の override state を即時更新して PageModel /
  // PageViewModel を再構成し、(2) settings.json へ保存する
  // (`patchSettingsJson`、既存の安全な whole-object write pattern)。live sync
  // ではない — 外部から settings.json が変わっても既存 Viewer には反映しない
  // (この Viewer 自身が変更したときだけ即時反映する要件)。
  const handleChangeHeadingPageBreakEnabled = useCallback(
    (enabled: boolean) => {
      setHeadingPageBreakOverride((prev) => ({
        enabled,
        maxLevel: prev?.maxLevel ?? headingPageBreakMaxLevel,
      }))
      void patchSettingsJson({ pageViewerBreakBeforeHeading: enabled })
    },
    [headingPageBreakMaxLevel],
  )

  const handleChangeHeadingPageBreakMaxLevel = useCallback(
    (level: number) => {
      const normalized = normalizePageViewerBreakBeforeHeadingMaxLevel(level)
      setHeadingPageBreakOverride((prev) => ({
        enabled: prev?.enabled ?? headingPageBreakEnabled,
        maxLevel: normalized,
      }))
      void patchSettingsJson({ pageViewerBreakBeforeHeadingMaxLevel: normalized })
    },
    [headingPageBreakEnabled],
  )

  // PV-READ-1: 現在有効な選択余白 / paper（popover 表示用）。実効値は
  // `readingSurfaceGeometry`（固定安全域込み）。
  const readingMarginTop = readingSurfaceGeometry.marginTop
  const readingMarginBottom = readingSurfaceGeometry.marginBottom
  const readingMarginInline = readingSurfaceGeometry.marginInline
  const readingPaperFrame = readingSurfaceGeometry.paperFrame
  // PV-READ-2: furniture（metrics 非影響）。
  const readingHeaderEnabled = readingFurniture.headerEnabled
  const readingHeaderAlign = readingFurniture.headerAlign
  const readingHeaderContent = readingFurniture.headerContent
  const readingFooterEnabled = readingFurniture.footerEnabled
  const readingFooterAlign = readingFurniture.footerAlign
  const readingSimpleCoverEnabled = readingSimpleCover.enabled
  const readingSimpleCoverWritingMode = readingSimpleCover.writingMode
  const readingSimpleCoverLayout = readingSimpleCover.layout

  const currentReadingSurfaceOverride = useCallback(
    (patch: Partial<ReadingSurfaceOverride>): ReadingSurfaceOverride => ({
      marginTop: readingMarginTop,
      marginBottom: readingMarginBottom,
      marginInline: readingMarginInline,
      paperFrame: readingPaperFrame,
      headerEnabled: readingHeaderEnabled,
      headerAlign: readingHeaderAlign,
      headerContent: readingHeaderContent,
      footerEnabled: readingFooterEnabled,
      footerAlign: readingFooterAlign,
      simpleCoverEnabled: readingSimpleCoverEnabled,
      simpleCoverWritingMode: readingSimpleCoverWritingMode,
      simpleCoverLayout: readingSimpleCoverLayout,
      ...patch,
    }),
    [
      readingMarginTop,
      readingMarginBottom,
      readingMarginInline,
      readingPaperFrame,
      readingHeaderEnabled,
      readingHeaderAlign,
      readingHeaderContent,
      readingFooterEnabled,
      readingFooterAlign,
      readingSimpleCoverEnabled,
      readingSimpleCoverWritingMode,
      readingSimpleCoverLayout,
    ],
  )

  // 余白・用紙枠変更のreflow transaction: ratio capture → page-turn cleanup →
  // override適用 → 各実frameのmeasure → page sequence更新後にratioを一度復元。
  // writing mode用pendingやtimeoutは使わず、連続変更では最新generationだけを残す。
  const beginReadingSurfaceReflow = useCallback(() => {
    const generation = readingSurfaceReflowGenerationRef.current + 1
    readingSurfaceReflowGenerationRef.current = generation
    pendingReadingSurfaceReflowRef.current = {
      generation,
      ratio: progressRatioForPageIndex(pageIndex, pageCount),
      awaitingSectionIds: new Set(flowSectionIds),
    }
    setReadingSurfaceReflowReadyGeneration(flowSectionIds.length === 0 ? generation : null)
    setReadingSurfaceReflowGeneration(generation)
    pageTurnFadeGenerationRef.current += 1
    pageTurnCleanupRef.current?.()
    pageTurnCleanupRef.current = null
    pageTurnPendingDirectionRef.current = null
    pageTurnPendingFadeInRef.current = false
    pageTurnPendingFadeTargetRef.current = null
    const stage = pageStageRef.current
    const mask = pageTurnMaskRef.current
    const overlay = pageTurnOverlayRef.current
    if (stage && mask && overlay) clearPageTurnTransitionElements({ stage, mask, overlay })
  }, [pageIndex, pageCount, flowSectionIds])

  const handleChangeReadingMarginTop = useCallback(
    (value: number) => {
      beginReadingSurfaceReflow()
      const marginTop = resolvePageViewerReadingSurfaceGeometry({ marginTop: value }).marginTop
      setReadingSurfaceOverride(currentReadingSurfaceOverride({ marginTop }))
      void patchSettingsJson({ pageViewerReadingMarginTop: marginTop })
    },
    [beginReadingSurfaceReflow, currentReadingSurfaceOverride],
  )

  const handleChangeReadingMarginBottom = useCallback(
    (value: number) => {
      beginReadingSurfaceReflow()
      const marginBottom = resolvePageViewerReadingSurfaceGeometry({ marginBottom: value }).marginBottom
      setReadingSurfaceOverride(currentReadingSurfaceOverride({ marginBottom }))
      void patchSettingsJson({ pageViewerReadingMarginBottom: marginBottom })
    },
    [beginReadingSurfaceReflow, currentReadingSurfaceOverride],
  )

  const handleChangeReadingMarginInline = useCallback(
    (value: number) => {
      beginReadingSurfaceReflow()
      const marginInline = resolvePageViewerReadingSurfaceGeometry({ marginInline: value }).marginInline
      setReadingSurfaceOverride(currentReadingSurfaceOverride({ marginInline }))
      void patchSettingsJson({ pageViewerReadingMarginInline: marginInline })
    },
    [beginReadingSurfaceReflow, currentReadingSurfaceOverride],
  )

  const handleChangeReadingPaperFrame = useCallback(
    (paperFrame: boolean) => {
      beginReadingSurfaceReflow()
      setReadingSurfaceOverride(currentReadingSurfaceOverride({ paperFrame }))
      void patchSettingsJson({ pageViewerReadingPaperFrame: paperFrame })
    },
    [beginReadingSurfaceReflow, currentReadingSurfaceOverride],
  )

  // PV-READ-2: furniture 変更は reflow / page-turn / metrics を起動しない。
  const handleChangeReadingHeaderEnabled = useCallback(
    (headerEnabled: boolean) => {
      setReadingSurfaceOverride(currentReadingSurfaceOverride({ headerEnabled }))
      void patchSettingsJson({ pageViewerReadingHeaderEnabled: headerEnabled })
    },
    [currentReadingSurfaceOverride],
  )

  const handleChangeReadingHeaderAlign = useCallback(
    (headerAlign: PageViewerReadingFurnitureAlign) => {
      setReadingSurfaceOverride(currentReadingSurfaceOverride({ headerAlign }))
      void patchSettingsJson({ pageViewerReadingHeaderAlign: headerAlign })
    },
    [currentReadingSurfaceOverride],
  )

  const handleChangeReadingHeaderContent = useCallback(
    (headerContent: PageViewerReadingHeaderContent) => {
      setReadingSurfaceOverride(currentReadingSurfaceOverride({ headerContent }))
      void patchSettingsJson({ pageViewerReadingHeaderContent: headerContent })
    },
    [currentReadingSurfaceOverride],
  )

  const handleChangeReadingFooterEnabled = useCallback(
    (footerEnabled: boolean) => {
      setReadingSurfaceOverride(currentReadingSurfaceOverride({ footerEnabled }))
      void patchSettingsJson({ pageViewerReadingFooterEnabled: footerEnabled })
    },
    [currentReadingSurfaceOverride],
  )

  const handleChangeReadingFooterAlign = useCallback(
    (footerAlign: PageViewerReadingFurnitureAlign) => {
      setReadingSurfaceOverride(currentReadingSurfaceOverride({ footerAlign }))
      void patchSettingsJson({ pageViewerReadingFooterAlign: footerAlign })
    },
    [currentReadingSurfaceOverride],
  )

  // PV-READ-3B: 表紙のON/OFFだけはPageViewModelを再構成する。ratio restoreは
  // 行わず、sequenceの既存resetによりpage 0（表紙または本文先頭）へ戻す。
  const handleChangeReadingSimpleCoverEnabled = useCallback(
    (simpleCoverEnabled: boolean) => {
      discardReadingSurfaceReflow()
      pageTurnFadeGenerationRef.current += 1
      pageTurnCleanupRef.current?.()
      pageTurnCleanupRef.current = null
      pageTurnPendingDirectionRef.current = null
      pageTurnPendingFadeInRef.current = false
      pageTurnPendingFadeTargetRef.current = null
      const stage = pageStageRef.current
      const mask = pageTurnMaskRef.current
      const overlay = pageTurnOverlayRef.current
      if (stage && mask && overlay) clearPageTurnTransitionElements({ stage, mask, overlay })
      setReadingSurfaceOverride(currentReadingSurfaceOverride({ simpleCoverEnabled }))
      void patchSettingsJson({ pageViewerReadingSimpleCoverEnabled: simpleCoverEnabled })
    },
    [currentReadingSurfaceOverride, discardReadingSurfaceReflow],
  )

  // 表紙groupだけの表示属性。PageModel / CSS Columns metricsを再構成しない。
  const handleChangeReadingSimpleCoverWritingMode = useCallback(
    (simpleCoverWritingMode: PageViewerReadingSimpleCoverWritingMode) => {
      setReadingSurfaceOverride(currentReadingSurfaceOverride({ simpleCoverWritingMode }))
      void patchSettingsJson({ pageViewerReadingSimpleCoverWritingMode: simpleCoverWritingMode })
    },
    [currentReadingSurfaceOverride],
  )

  const handleChangeReadingSimpleCoverLayout = useCallback(
    (simpleCoverLayout: PageViewerReadingSimpleCoverLayout) => {
      setReadingSurfaceOverride(currentReadingSurfaceOverride({ simpleCoverLayout }))
      void patchSettingsJson({ pageViewerReadingSimpleCoverLayout: simpleCoverLayout })
    },
    [currentReadingSurfaceOverride],
  )

  // TOC entry と heading anchor は PageModel 側で同じ anchor id を共有する。
  // renderer に top-level flow block ごとの id を渡しておき、click 時にはその
  // DOM rect から当該 flow section 内の column index だけを求める。
  const headingAnchorIdsByBlockId = useMemo(() => {
    const anchors = new Map<string, string>()
    if (!viewModel) return anchors
    for (const anchor of viewModel.anchors) {
      if (anchor.kind !== 'heading' || anchor.blockIndex === undefined) continue
      anchors.set(`${anchor.sectionId}:${anchor.blockIndex}`, anchor.id)
    }
    return anchors
  }, [viewModel])

  // TOC synthetic section の項目クリックと、outline side panel (PV-COL-9) の
  // 項目クリックは、どちらもこの同一 callback を経由する。DOM page 位置計算
  // (`resolveHeadingJumpTarget` / `computeHeadingJumpLocalPageIndex`、
  // `pageViewerHeadingJump.ts`) はここでしか呼ばない。
  const jumpToHeadingAnchor = useCallback(
    (anchorId: string) => {
      if (!viewModel) return
      const target = resolveHeadingJumpTarget(anchorId, viewModel.anchors, sequence.entries)
      if (!target) return
      const { entry } = target

      // flow 自身と heading は同じ transform を受けるので、両者の rect の差は
      // transform 前の column position と一致する。ここでは live scroll size を
      // 読まず、既に確定済みの sequence pageCount に対する local page だけを求める。
      let localPageIndex = 0
      const el = document.getElementById(anchorId)
      const flow = el?.closest<HTMLElement>('.page-viewer-window__page-flow')
      const frame = flow?.parentElement
      if (el && flow && frame) {
        const targetRect = el.getBoundingClientRect()
        const flowRect = flow.getBoundingClientRect()
        const pagePitch = writingMode === 'vertical-rl' ? frame.clientHeight : frame.clientWidth
        localPageIndex = computeHeadingJumpLocalPageIndex({
          targetRect,
          flowRect,
          pagePitch,
          writingMode,
          pageCount: entry.pageCount,
        })
      }

      navigateToPage(entry.startPageIndex + localPageIndex)
      bodyRef.current?.focus()
    },
    [navigateToPage, sequence.entries, viewModel, writingMode],
  )

  // Outline side panel (PV-COL-9 / PV-COL-13): header の icon button で開閉する
  // 読み取り専用 panel。PV-COL-13 以降は常時マウントし、開閉は CSS
  // `transform: translateX()` + `.is-open` のみ (width/height/flex/opacity の
  // transition は使わない)。閉じている間は `inert` + `aria-hidden` +
  // `pointer-events: none` で pointer / Tab / a11y tree から除外する。
  // panel は overlay なので body の寸法は変えない (§16)。トグルボタン自身は
  // header 内にあるため、これで閉じたときに focus をそのままにすると header の
  // `:focus-within` が真であり続け、auto-hide のタイマーが切れても header が
  // 退避しない (Escape close は既存で `bodyRef.current?.focus()` を呼んでいるが、
  // ボタン直接クリックの close には同じ手当てが無かった回帰)。閉じる方向の
  // トグルでも Escape / outside click と同じく body へ focus を戻し、auto-hide
  // が再開できるようにする。
  const [outlineOpen, setOutlineOpen] = useState(false)
  const outlinePanelRef = useRef<HTMLElement | null>(null)
  const outlineToggleRef = useRef<HTMLButtonElement | null>(null)
  const toggleOutline = useCallback(() => {
    const next = !outlineOpen
    setOutlineOpen(next)
    if (!next) {
      bodyRef.current?.focus()
    }
  }, [outlineOpen])

  // Reader Chrome: header auto-hide。header は viewport 上の overlay
  // (`position: absolute`) で、hidden 中は `transform: translateY(-100%)` で
  // 画面外へ完全に退避する (opacity だけで隠す実装にはしない — 要件)。
  // `:focus-within` は header 内 button への Tab focus だけで CSS が即座に
  // 反応する (transform で画面外にあっても focus 自体は届く)。この state は
  // 「一定時間操作が無ければ隠す」タイマーだけを持ち、`:focus-within` の
  // 即時反応は CSS に任せる — 両者は独立した OR 条件 (CSS セレクタでの合成)
  // なので、ここでの取りこぼしが見た目の反応を壊すことはない。
  const [headerVisible, setHeaderVisible] = useState(false)
  // Header の固定はこの Viewer window の session state だけに留める。読書面
  // settings.json / snapshot / export へは保存しない。
  const [headerPinned, setHeaderPinned] = useState(false)
  const headerHideTimeoutRef = useRef<number | null>(null)
  const clearHeaderHideTimer = useCallback(() => {
    if (headerHideTimeoutRef.current === null) return
    window.clearTimeout(headerHideTimeoutRef.current)
    headerHideTimeoutRef.current = null
  }, [])
  const revealHeader = useCallback(() => {
    setHeaderVisible((prev) => (prev ? prev : true))
    clearHeaderHideTimer()
    if (headerPinned) return
    headerHideTimeoutRef.current = window.setTimeout(() => {
      headerHideTimeoutRef.current = null
      setHeaderVisible(false)
    }, HEADER_AUTO_HIDE_DELAY_MS)
  }, [clearHeaderHideTimer, headerPinned])

  const toggleHeaderPinned = useCallback(() => {
    if (headerPinned) {
      setHeaderPinned(false)
      // `:focus-within` が残ると unpin 後も header が退避しないため、通常の
      // auto-hide と同じく本文へ focus を戻す。
      bodyRef.current?.focus()
      return
    }
    clearHeaderHideTimer()
    setHeaderPinned(true)
    setHeaderVisible(true)
    // pinは常時表示をstateで担うため、buttonにfocusを残す必要はない。本文へ
    // 戻して既存のPageDown / Arrowのbody handlerを維持する。
    bodyRef.current?.focus()
  }, [clearHeaderHideTimer, headerPinned])

  useEffect(() => {
    return () => {
      clearHeaderHideTimer()
    }
  }, [clearHeaderHideTimer])

  // pin中は既存timerを必ず除去して常時表示する。解除時は viewer ready
  // 後と同じ通常の猶予から auto-hide へ戻す。
  useEffect(() => {
    if (state.kind !== 'ready') return
    if (headerPinned) {
      clearHeaderHideTimer()
      setHeaderVisible(true)
      return
    }
    revealHeader()
  }, [clearHeaderHideTimer, headerPinned, revealHeader, state.kind])

  // outline panel の開閉 (どちらの向きも) は header を再表示する。開いている間は
  // 下の `isHeaderChromeVisible` の OR 条件で強制的に見せ続け、閉じた瞬間に
  // フルの猶予をもう一度もらえるよう、閉じた側でも revealHeader() を呼ぶ。
  useEffect(() => {
    revealHeader()
  }, [outlineOpen, revealHeader])

  // テーマ menu の開閉も同様に header を再表示する。menu 自体は header の DOM
  // 子なので `:focus-within`/`:hover` が自然に発火し理論上は不要だが、outline
  // panel と同じ扱いにしておくことで「header から開く overlay は全部この OR に
  // 入れる」という一貫した規則にする (念のための二重の安全策)。
  useEffect(() => {
    revealHeader()
  }, [themeMenuOpen, revealHeader])

  // ページ遷移 menu の開閉も同様に header を再表示する (PV-COL-16、
  // 「header から開く overlay は全部この OR に入れる」規則を維持)。
  useEffect(() => {
    revealHeader()
  }, [transitionMenuOpen, revealHeader])

  // PV-SET-4A: Settings popover の開閉も同様に header を再表示する。
  useEffect(() => {
    revealHeader()
  }, [settingsMenuOpen, revealHeader])

  // header 自体には常に `pointer-events: auto` があり (画面外へ transform
  // 退避していても Tab focus は届く)、加えて常時マウント済みの
  // `.header-reveal-zone` (window 最上端の薄い hit-zone、header の transform
  // 状態に関わらず常にそこにある) が「window 上端への pointer hover」を拾う。
  // ここでの hover / focus / pointerdown はすべて「隠れていても届く」= 要件の
  // 「header 内 focus」「header 操作後」を満たす。
  const isHeaderChromeVisible =
    headerPinned || headerVisible || outlineOpen || themeMenuOpen || transitionMenuOpen || settingsMenuOpen

  // Escape で閉じ、body へ focus を戻して keyboard page navigation を継続させる。
  useEffect(() => {
    if (!outlineOpen) return
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setOutlineOpen(false)
      bodyRef.current?.focus()
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [outlineOpen])

  // PV-COL-13: panel 外の pointerdown で閉じる。panel 自身と outline toggle は
  // 除外し、既存のトグル開閉と競合させない。theme menu の outside-click
  // listener とは独立した effect (互いの root 外ならそれぞれ閉じるだけ)。
  // outline link click は panel 内なのでここには来ず、自動 close しない。
  useEffect(() => {
    if (!outlineOpen) return
    const handlePointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target as Node
      if (outlinePanelRef.current?.contains(target)) return
      if (outlineToggleRef.current?.contains(target)) return
      setOutlineOpen(false)
      bodyRef.current?.focus()
    }
    window.addEventListener('pointerdown', handlePointerDown)
    return () => window.removeEventListener('pointerdown', handlePointerDown)
  }, [outlineOpen])

  const headingAnchors = useMemo(
    () => (viewModel ? viewModel.anchors.filter((anchor) => anchor.kind === 'heading') : []),
    [viewModel],
  )

  // PageDown/Space/PageUp/Shift+Space と、writing modeに対応した左右Arrowは
  // 1 ページ移動 (page index ±1)。
  // キー → next/prev の解釈は pure helper、移動そのものは column layout hook に
  // 委譲し、component 側でページ位置の計算を複製しない。
  useEffect(() => {
    const body = bodyRef.current
    if (!body) return
    if (state.kind !== 'ready') return
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      // Future-proofing event target guard: never hijack typing in a future
      // input/textarea/contenteditable. None exist in this read-only viewer today.
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return
      }
      const direction = resolvePageMoveDirectionForKey(event.key, event.shiftKey, writingMode)
      if (!direction) {
        if (event.key === 'Home') {
          event.preventDefault()
          navigateToPage(0)
          return
        }
        if (event.key === 'End') {
          event.preventDefault()
          navigateToPage(pageCount - 1)
          return
        }
        return
      }
      event.preventDefault()
      navigateByPage(direction)
    }
    body.addEventListener('keydown', handleKeyDown)
    // Auto-focus so keys work immediately after opening the viewer, without
    // requiring an explicit click first. This effect only re-runs when
    // transitioning into 'ready' (writingMode is fixed for the lifetime of an
    // open snapshot), so this never steals focus back later.
    body.focus()
    return () => {
      body.removeEventListener('keydown', handleKeyDown)
    }
  }, [state.kind, writingMode, pageCount, navigateToPage, navigateByPage])

  // Track click と thumb drag は同じ経路: pointer の画面上位置を最寄り
  // page index へ snap して移動する (任意 scroll offset へは変換しない)。
  // page index が変わったときだけ goToPage → transform 更新
  // (`usePageViewerColumnLayout.goToPage` が同一 index を no-op にする)。
  const applyPointerToPage = useCallback(
    (clientX: number, railEl: HTMLElement, options?: { suppressTransition?: boolean }) => {
      const rect = railEl.getBoundingClientRect()
      const nextPageIndex = pageIndexFromScrubberPointer(
        clientX,
        rect.left,
        rect.width,
        writingMode,
        pageCount,
      )
      navigateToPage(
        nextPageIndex,
        options?.suppressTransition ? { suppressTransition: true } : undefined,
      )
      return nextPageIndex
    },
    [writingMode, navigateToPage, pageCount],
  )

  const handleRailPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      // 主ボタン以外 (右クリック等) では scrub しない。
      if (event.button !== 0) return
      const rail = event.currentTarget
      rail.setPointerCapture(event.pointerId)
      activeScrubberPointerIdRef.current = event.pointerId
      isScrubbingRef.current = true
      setIsScrubbing(true)
      // 単発 click は keyboard / TOC と同じく page-turn transition を通す。
      // 連続 drag の live preview は、page が変わった pointermove 側で suppress する。
      scrubberPointerDownPageRef.current = applyPointerToPage(event.clientX, rail)
    },
    [applyPointerToPage],
  )

  const handleRailPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      // pointer capture 中は rail 外へ出ても move が届く。capture 前/後の
      // 迷子イベントだけ isScrubbingRef で弾く。
      if (!isScrubbingRef.current) return
      if (activeScrubberPointerIdRef.current !== event.pointerId) return
      const rect = event.currentTarget.getBoundingClientRect()
      const nextPageIndex = pageIndexFromScrubberPointer(
        event.clientX,
        rect.left,
        rect.width,
        writingMode,
        pageCount,
      )
      // 同一 page への微小 move (click のノイズ) では transition を潰さない。
      if (nextPageIndex === scrubberPointerDownPageRef.current) return
      // drag で page が変わったら deferred fade を止め、即時 preview する。
      scrubberPointerDownPageRef.current = nextPageIndex
      navigateToPage(nextPageIndex, { suppressTransition: true })
    },
    [writingMode, pageCount, navigateToPage],
  )

  const endScrubbing = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (activeScrubberPointerIdRef.current !== event.pointerId) return
    if (!isScrubbingRef.current && !event.currentTarget.hasPointerCapture(event.pointerId)) {
      return
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    activeScrubberPointerIdRef.current = null
    isScrubbingRef.current = false
    scrubberPointerDownPageRef.current = null
    setIsScrubbing(false)
    // rail (tabIndex 付き) は pointerdown で focus を奪うため、drag / click の
    // 終了後は body へ戻し、直後のキーボードページ送りが常に効くようにする。
    bodyRef.current?.focus()
  }, [])

  // rail 外で pointerup が失われた場合でも、capture 解除で scrub を終了する。
  const handleRailLostPointerCapture = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (activeScrubberPointerIdRef.current !== event.pointerId) return
    activeScrubberPointerIdRef.current = null
    scrubberPointerDownPageRef.current = null
    if (!isScrubbingRef.current) return
    isScrubbingRef.current = false
    setIsScrubbing(false)
    bodyRef.current?.focus()
  }, [])

  // scrubber rail 専用 keyboard: Arrow / Home / End で page index を動かす。
  // writingMode の視覚方向と矛盾しないよう `resolveScrubberKeyAction` に委譲。
  // PageDown / Space 等は body 側の handler に任せ、ここでは扱わない。
  const handleRailKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const action = resolveScrubberKeyAction(event.key, writingMode)
      if (!action) return
      event.preventDefault()
      event.stopPropagation()
      if (action.kind === 'home') {
        navigateToPage(0)
        return
      }
      if (action.kind === 'end') {
        navigateToPage(Math.max(0, pageCount - 1))
        return
      }
      navigateToPage(pageIndex + action.delta)
    },
    [writingMode, navigateToPage, pageCount, pageIndex],
  )

  if (state.kind === 'loading') {
    return (
      <div className="page-viewer-window page-viewer-window--status">読み込み中…</div>
    )
  }
  if (state.kind === 'error' || !viewModel) {
    return (
      <div className="page-viewer-window page-viewer-window--status">
        ページビューアを開けませんでした。
      </div>
    )
  }

  const { payload } = state

  // PV-READ-2: header 文言は open-time payload + metadata gate のみ（章移動で変えない）。
  // footer だけ pageIndex / pageCount に追従。
  const furnitureHeader = resolvePageViewerReadingFurnitureHeaderFromPayload(
    payload,
    readingHeaderContent,
  )
  const furnitureHeaderEmpty = !furnitureHeader.title && !furnitureHeader.author
  const furnitureFooterText = formatPageViewerReadingFurnitureFooter(pageIndex, pageCount)
  const activeSequenceItem = activeLocation ? sequenceItems[activeLocation.itemIndex] : undefined
  // PV-READ-3B: 読書面 furniture は固定表紙のときだけ display-only で隠す。
  // page count / pitch / frame / footer 文言の計算には一切介入しない。
  const activeSimpleCover = activeSequenceItem?.kind === 'fixedSyntheticPage'

  // 読書進行率は pageIndex / maxPageIndex 由来 (scroll 位置からは計算しない)。
  // thumb の画面上位置 (0=左端/1=右端) は vertical-rl では左右反転するので
  // `flipRatioForWritingMode` を progress→visual 方向にも再利用する (自己逆写像)。
  const progressRatio = progressRatioForPageIndex(pageIndex, pageCount)
  const thumbVisualRatio = flipRatioForWritingMode(progressRatio, writingMode)
  const aria = scrubberAriaProps(pageIndex, pageCount)

  return (
    <div
      ref={windowRootRef}
      className="page-viewer-window"
      data-platform={viewerPlatform}
      style={styleVars}
    >
      {/* PV-COL-15: header (reveal-zone 込み) は独立 component
          `PageViewerHeader` に抽出済み — 表示は文書タイトル / 書字方向切替 /
          Reader theme menu / Outline toggle に限定し、editor tab / save /
          undo-redo / search / explorer / document type 等の App 固有機能は
          一切持たない。既存の overlay / auto-hide / top-edge reveal /
          `prefers-reduced-motion` は無変更、背景・境界線・icon button・
          tooltip・separator・タイトル文字色だけが起動元メインアプリの UI
          theme (`--pv-ui-*`、`payload.uiTheme` 由来) に従う。 */}
      <PageViewerHeader
        windowRootRef={windowRootRef}
        title={payload.title}
        isVisible={isHeaderChromeVisible}
        onReveal={revealHeader}
        headerPinned={headerPinned}
        onToggleHeaderPinned={toggleHeaderPinned}
        writingMode={writingMode}
        onToggleWritingMode={toggleWritingMode}
        themeMenuOpen={themeMenuOpen}
        onToggleThemeMenu={toggleThemeMenu}
        themeMenuRootRef={themeMenuRootRef}
        readerTheme={readerTheme}
        onSelectReaderTheme={selectReaderTheme}
        transitionMenuOpen={transitionMenuOpen}
        onToggleTransitionMenu={toggleTransitionMenu}
        transitionMenuRootRef={transitionMenuRootRef}
        pageTurnTransition={pageTurnTransition}
        onSelectPageTurnTransition={selectPageTurnTransition}
        pageTurnSpeedMs={pageTurnSpeedMs}
        onChangePageTurnSpeedMs={handlePageTurnSpeedChange}
        documentThemeColors={{
          pageColor: payload.pageColor,
          textColor: payload.textColor,
          headingColor: payload.headingColor,
        }}
        outlineOpen={outlineOpen}
        onToggleOutline={toggleOutline}
        outlineToggleRef={outlineToggleRef}
        settingsMenuOpen={settingsMenuOpen}
        onToggleSettingsMenu={toggleSettingsMenu}
        settingsMenuRootRef={settingsMenuRootRef}
        headingPageBreakEnabled={headingPageBreakEnabled}
        headingPageBreakMaxLevel={headingPageBreakMaxLevel}
        onChangeHeadingPageBreakEnabled={handleChangeHeadingPageBreakEnabled}
        onChangeHeadingPageBreakMaxLevel={handleChangeHeadingPageBreakMaxLevel}
        readingMarginTop={readingMarginTop}
        readingMarginBottom={readingMarginBottom}
        readingMarginInline={readingMarginInline}
        readingPaperFrame={readingPaperFrame}
        onChangeReadingMarginTop={handleChangeReadingMarginTop}
        onChangeReadingMarginBottom={handleChangeReadingMarginBottom}
        onChangeReadingMarginInline={handleChangeReadingMarginInline}
        onChangeReadingPaperFrame={handleChangeReadingPaperFrame}
        readingHeaderEnabled={readingHeaderEnabled}
        readingHeaderAlign={readingHeaderAlign}
        readingHeaderContent={readingHeaderContent}
        readingFooterEnabled={readingFooterEnabled}
        readingFooterAlign={readingFooterAlign}
        onChangeReadingHeaderEnabled={handleChangeReadingHeaderEnabled}
        onChangeReadingHeaderAlign={handleChangeReadingHeaderAlign}
        onChangeReadingHeaderContent={handleChangeReadingHeaderContent}
        onChangeReadingFooterEnabled={handleChangeReadingFooterEnabled}
        onChangeReadingFooterAlign={handleChangeReadingFooterAlign}
        readingSimpleCoverEnabled={readingSimpleCoverEnabled}
        readingSimpleCoverWritingMode={readingSimpleCoverWritingMode}
        readingSimpleCoverLayout={readingSimpleCoverLayout}
        onChangeReadingSimpleCoverEnabled={handleChangeReadingSimpleCoverEnabled}
        onChangeReadingSimpleCoverWritingMode={handleChangeReadingSimpleCoverWritingMode}
        onChangeReadingSimpleCoverLayout={handleChangeReadingSimpleCoverLayout}
      />
      {/* body (本文) の positioning context。outline panel も下部 scrubber も
          ここに `position: absolute` overlay として重ね、body 自身の幅・
          高さには一切影響させない (要件: panel は本文を押し縮めない)。
          `.page-viewer-window__content` 自身は z-index を持たないため、
          子要素 (panel / scrubber) の z-index は親の stacking context を
          突き抜けて `.page-viewer-window` レベルで header / reveal-zone と
          直接比較される。 */}
      <div className="page-viewer-window__content">
        {/* `data-writing-mode` はこの content surface だけに効かせる。header は
            常に横書きのまま (要件: window header は横書きでも構わない)。
            `tabIndex` はキーボードページ送り (PageDown/PageUp/Space/矢印) を
            受け取るために必要 — div は既定では focus できない。 */}
        <div
          className="page-viewer-window__body"
          data-writing-mode={writingMode}
          data-page-index={pageIndex}
          data-page-count={pageCount}
          data-paper-frame={readingPaperFrame ? 'on' : 'off'}
          ref={bodyRef}
          tabIndex={0}
          aria-label="ページ内容"
        >
          <div className="page-viewer-window__page-surface">
            <div className="page-viewer-window__page-stage" ref={pageStageRef}>
              {viewModel.items.map((item, itemIndex) => {
                const isActive = activeLocation?.itemIndex === itemIndex
                const localPageIndex = isActive ? activeLocation.localPageIndex : 0
                return (
                  <PageViewerSequenceItem
                    key={item.sectionId}
                    item={item}
                    itemIndex={itemIndex}
                    isActive={isActive}
                    localPageIndex={localPageIndex}
                    writingMode={writingMode}
                    onFlowPageCountChange={setFlowPageCount}
                    flowPageCountRegistrationGeneration={flowPageCountRegistrationGeneration}
                    headingAnchorIdsByBlockId={headingAnchorIdsByBlockId}
                    onTocEntryActivate={jumpToHeadingAnchor}
                    imageScope={payload.imageScope}
                    autoTcy={autoTcy}
                    showRoleLabels={showRoleLabels}
                    readingSurfaceReflowGeneration={readingSurfaceReflowGeneration}
                    onReadingSurfaceMeasure={acknowledgeReadingSurfaceMeasure}
                    simpleCoverWritingMode={readingSimpleCoverWritingMode}
                    simpleCoverLayout={readingSimpleCoverLayout}
                  />
                )
              })}
            </div>
            {/* PV-READ-2: 余白帯内の absolute furniture。metrics / reflow 非影響。 */}
            <div
              className="page-viewer-window__reading-header"
              data-enabled={readingHeaderEnabled && !activeSimpleCover ? 'on' : 'off'}
              data-align={readingHeaderAlign}
              data-empty={furnitureHeaderEmpty ? 'true' : 'false'}
              aria-hidden="true"
            >
              {furnitureHeader.title ? (
                <span className="page-viewer-window__reading-header-title">
                  {furnitureHeader.title}
                </span>
              ) : null}
              {readingHeaderContent === 'title-author' && furnitureHeader.author ? (
                <span className="page-viewer-window__reading-header-author">
                  {furnitureHeader.author}
                </span>
              ) : null}
            </div>
            <div
              className="page-viewer-window__reading-footer"
              data-enabled={readingFooterEnabled && !activeSimpleCover ? 'on' : 'off'}
              data-align={readingFooterAlign}
              aria-hidden="true"
            >
              {furnitureFooterText}
            </div>
            <div
              className="page-viewer-window__transition-mask"
              ref={pageTurnMaskRef}
              data-writing-mode={writingMode}
              aria-hidden="true"
            />
            <div
              className="page-viewer-window__transition-overlay"
              ref={pageTurnOverlayRef}
              data-writing-mode={writingMode}
              aria-hidden="true"
            />
          </div>
        </div>
        <PageViewerOutlinePanel
          open={outlineOpen}
          panelRef={outlinePanelRef}
          headings={headingAnchors}
          onActivate={jumpToHeadingAnchor}
        />
        {/* 下部 overlay scrubber。通常時はほぼ非表示、hover / focus-within /
            drag 中 (`is-active`) だけ見せる。scrubber 自体は常に横書き固定
            (writing-mode を明示的に指定して本文側の縦書きを継承しない)。
            `.content` の直接の子 (body の兄弟) にすることで、常に本文の
            全幅を覆う — outline panel が開いていても z-index で panel より
            上に来るので、panel に隠されて操作不能になることがない。aria は
            page index ベース (`aria-valuemin=0` / `valuemax=maxPageIndex` /
            `valuenow=pageIndex` / `valuetext="X / Y"`)。 */}
        <div
          className={
            isScrubbing
              ? 'page-viewer-window__scrubber-zone is-active'
              : 'page-viewer-window__scrubber-zone'
          }
        >
          <div
            className="page-viewer-window__scrubber-rail"
            role="slider"
            tabIndex={0}
            aria-label="読書位置"
            aria-orientation="horizontal"
            aria-valuemin={aria['aria-valuemin']}
            aria-valuemax={aria['aria-valuemax']}
            aria-valuenow={aria['aria-valuenow']}
            aria-valuetext={aria['aria-valuetext']}
            onPointerDown={handleRailPointerDown}
            onPointerMove={handleRailPointerMove}
            onPointerUp={endScrubbing}
            onPointerCancel={endScrubbing}
            onLostPointerCapture={handleRailLostPointerCapture}
            onKeyDown={handleRailKeyDown}
          >
            <div
              className="page-viewer-window__scrubber-thumb"
              style={{ insetInlineStart: `${thumbVisualRatio * 100}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * PV-COL-15: Integrated Page Viewer Header。`UnifiedHeader.tsx` (メインアプリ
 * 本体、editor / tab / save / undo-redo / search / explorer / document type
 * などに深く依存する) をそのまま流用せず、Viewer 専用の軽量 component として
 * 独立させた。表示・操作は文書タイトル / 書字方向切替 / Reader theme menu /
 * Outline toggle の 4 つに限定し、App 固有 command は一切持ち込まない。
 *
 * 既存の overlay 化・auto-hide タイマー・top-edge reveal-zone・
 * `prefers-reduced-motion` の実装 (`PageViewerWindowRoot.css`) は無変更のまま
 * この component 内へそのまま移した (振る舞いの変更ではなく、JSX の抽出)。
 *
 * 色は 2 つの独立した経路を持つ:
 * - header 自身の背景・境界線・icon button・tooltip・separator・タイトル
 *   文字色は `--pv-ui-*` (起動元メインアプリの UI theme snapshot、
 *   `pageViewerUiTheme.ts` 経由、`PageViewerWindowRoot.tsx` の
 *   `buildPageViewerUiThemeStyleVars()` がルートへ注入) に従う。
 * - テーマ dropdown の popover 自体 (選択肢の背景/hover) と outline panel は
 *   この component の外側で定義された Reader theme (`--bg-surface` 等) の
 *   まま — 変更しない。
 *
 * `useWindowControlsOverlayReservation` / `detectRuntimePlatform` は
 * メインアプリ `UnifiedHeader.tsx` が使っているのと同じ既存 hook / helper を
 * そのまま再利用する (二重実装しない)。Windows/Linux では、この header 自身の
 * 右余白を native window-controls-overlay の実測幅ぶん確保する
 * (`useWindowControlsOverlayReservation` 経由)。macOS は `electron/main.ts` の
 * `createPageViewerWindow()` が main window (`createWindow()`) と同じ
 * `titleBarStyle: "hidden"` + `trafficLightPosition` を設定するため、
 * header 左端に固定の左余白 (`[data-platform="darwin"]` の CSS、実測で
 * メインアプリと同じ幅では traffic lights にタイトル 1 文字目がわずかに
 * 重なったため、それより広い 78px にしてある) を確保し、native traffic
 * lights とタイトル / action button 群が重ならないようにする。
 *
 * **P1 修正: native window ドラッグは、animate する header 自身ではなく
 * 専用の sibling (`.page-viewer-window__header-drag-region`) が担う。**
 * 初版は `-webkit-app-region: drag` を header 自身に付けていたが、header は
 * 同時に (1) native drag hit-test、(2) DOM の hover/reveal 判定、
 * (3) `transform: translateY()` による auto-hide 退避、の 3 つを兼ねてしま
 * い、animate する要素の上で native drag と DOM pointer 判定が競合して
 * 「ドラッグできたりできなかったり」「header が不安定に出入りする」症状に
 * なった (メインアプリの `.unified-header` は固定表示なので同じ構成でも
 * 問題にならない)。修正して、header と同じ footprint を持つが
 * **transform しない** 専用の sibling へ drag 領域を分離した。header 自身は
 * 「視覚レイヤー + 操作ボタン」に徹し、タイトル / 余白部分は
 * `pointer-events: none` で背後の drag-region へ click-through する。
 * `.page-viewer-window__header-actions` (書字方向切替 / テーマ menu /
 * outline toggle) だけを `pointer-events: auto` で再度受け取り可能にし、
 * その中の `<button>` と `.page-viewer-window__theme-menu-list` popover は
 * 既存どおり `-webkit-app-region: no-drag`。reveal-zone も明示的に
 * `no-drag` にし、hover 判定を native drag hit-test から独立させている。
 */
function PageViewerHeader({
  windowRootRef,
  title,
  isVisible,
  onReveal,
  headerPinned,
  onToggleHeaderPinned,
  writingMode,
  onToggleWritingMode,
  themeMenuOpen,
  onToggleThemeMenu,
  themeMenuRootRef,
  readerTheme,
  onSelectReaderTheme,
  transitionMenuOpen,
  onToggleTransitionMenu,
  transitionMenuRootRef,
  pageTurnTransition,
  onSelectPageTurnTransition,
  pageTurnSpeedMs,
  onChangePageTurnSpeedMs,
  documentThemeColors,
  outlineOpen,
  onToggleOutline,
  outlineToggleRef,
  settingsMenuOpen,
  onToggleSettingsMenu,
  settingsMenuRootRef,
  headingPageBreakEnabled,
  headingPageBreakMaxLevel,
  onChangeHeadingPageBreakEnabled,
  onChangeHeadingPageBreakMaxLevel,
  readingMarginTop,
  readingMarginBottom,
  readingMarginInline,
  readingPaperFrame,
  onChangeReadingMarginTop,
  onChangeReadingMarginBottom,
  onChangeReadingMarginInline,
  onChangeReadingPaperFrame,
  readingHeaderEnabled,
  readingHeaderAlign,
  readingHeaderContent,
  readingFooterEnabled,
  readingFooterAlign,
  onChangeReadingHeaderEnabled,
  onChangeReadingHeaderAlign,
  onChangeReadingHeaderContent,
  onChangeReadingFooterEnabled,
  onChangeReadingFooterAlign,
  readingSimpleCoverEnabled,
  readingSimpleCoverWritingMode,
  readingSimpleCoverLayout,
  onChangeReadingSimpleCoverEnabled,
  onChangeReadingSimpleCoverWritingMode,
  onChangeReadingSimpleCoverLayout,
}: {
  windowRootRef: RefObject<HTMLDivElement | null>
  title: string
  isVisible: boolean
  onReveal: () => void
  headerPinned: boolean
  onToggleHeaderPinned: () => void
  writingMode: WritingMode
  onToggleWritingMode: () => void
  themeMenuOpen: boolean
  onToggleThemeMenu: () => void
  themeMenuRootRef: RefObject<HTMLDivElement | null>
  readerTheme: PageViewerReaderTheme
  onSelectReaderTheme: (theme: PageViewerReaderTheme) => void
  transitionMenuOpen: boolean
  onToggleTransitionMenu: () => void
  transitionMenuRootRef: RefObject<HTMLDivElement | null>
  pageTurnTransition: PageViewerPageTurnTransition
  onSelectPageTurnTransition: (transition: PageViewerPageTurnTransition) => void
  pageTurnSpeedMs: number
  onChangePageTurnSpeedMs: (value: number) => void
  documentThemeColors: PageViewerReaderThemeDocumentColors
  outlineOpen: boolean
  onToggleOutline: () => void
  outlineToggleRef: RefObject<HTMLButtonElement | null>
  settingsMenuOpen: boolean
  onToggleSettingsMenu: () => void
  settingsMenuRootRef: RefObject<HTMLDivElement | null>
  headingPageBreakEnabled: boolean
  headingPageBreakMaxLevel: number
  onChangeHeadingPageBreakEnabled: (enabled: boolean) => void
  onChangeHeadingPageBreakMaxLevel: (level: number) => void
  readingMarginTop: PageViewerReadingMarginPx
  readingMarginBottom: PageViewerReadingMarginPx
  readingMarginInline: PageViewerReadingMarginPx
  readingPaperFrame: boolean
  onChangeReadingMarginTop: (value: number) => void
  onChangeReadingMarginBottom: (value: number) => void
  onChangeReadingMarginInline: (value: number) => void
  onChangeReadingPaperFrame: (enabled: boolean) => void
  readingHeaderEnabled: boolean
  readingHeaderAlign: PageViewerReadingFurnitureAlign
  readingHeaderContent: PageViewerReadingHeaderContent
  readingFooterEnabled: boolean
  readingFooterAlign: PageViewerReadingFurnitureAlign
  onChangeReadingHeaderEnabled: (enabled: boolean) => void
  onChangeReadingHeaderAlign: (align: PageViewerReadingFurnitureAlign) => void
  onChangeReadingHeaderContent: (content: PageViewerReadingHeaderContent) => void
  onChangeReadingFooterEnabled: (enabled: boolean) => void
  onChangeReadingFooterAlign: (align: PageViewerReadingFurnitureAlign) => void
  readingSimpleCoverEnabled: boolean
  readingSimpleCoverWritingMode: PageViewerReadingSimpleCoverWritingMode
  readingSimpleCoverLayout: PageViewerReadingSimpleCoverLayout
  onChangeReadingSimpleCoverEnabled: (enabled: boolean) => void
  onChangeReadingSimpleCoverWritingMode: (writingMode: PageViewerReadingSimpleCoverWritingMode) => void
  onChangeReadingSimpleCoverLayout: (layout: PageViewerReadingSimpleCoverLayout) => void
}) {
  const headerElementRef = useRef<HTMLElement | null>(null)
  const dragRegionElementRef = useRef<HTMLDivElement | null>(null)
  // platform は open 時点で 1 度だけ確定させれば十分 (window 生成後に
  // 変わらない)。メインアプリの `useAppUiState.ts` と同じ
  // `detectRuntimePlatform()` (`window.nyozeBridge?.platform` を読むだけの
  // pure helper、preload はどの window でも同じ値を公開する) を再利用する。
  const platform = useMemo(() => detectRuntimePlatform(), [])
  const usesNativeWindowControls =
    platform === 'darwin' || platform === 'win32' || platform === 'linux'
  // メインアプリ `UnifiedHeader.tsx` と全く同じ hook。Windows/Linux の
  // native window-controls-overlay 実測幅を測り、header 自身の inline style
  // へ `--header-window-controls-reserved-width` を書く (対象外の platform
  // では何もしない)。
  // P1 修正 (Windows/Linux で drag region が action 群と再び重なる) の
  // 経緯: この CSS 変数は元々 headerRef.current の inline style にしか
  // 書かれず、CSS custom property は子孫方向にしか継承されないため、
  // header の sibling である `.page-viewer-window__header-drag-region` は
  // この値を継承できなかった。
  // P2 修正 (この hook 自身を拡張): 最初の P1 修正では、hook の戻り値
  // (実測幅の number) を受け取って別の `useEffect` から drag-region へ
  // 後追いで複製していたが、これだと window resize / titlebar-area の
  // geometrychange 時に「header は新しい値へ更新済み、drag-region はまだ
  // 前回の値」という 1 描画分のズレが生じ得た (hook が
  // `header.style.setProperty()` → `setState()` の順で実行し、React の
  // 再レンダー後に別 effect が実行されるため)。hook 自身に
  // `additionalTargetRef` を渡せるよう拡張し、`applyReservation()` の
  // **同じ呼び出し内** で header と drag-region の両方へ同時に書き込む
  // ことで、この transient なズレそのものを無くした
  // (`useWindowControlsOverlayReservation.ts` 参照。初期化・resize・
  // geometrychange・cleanup のすべてがこの 1 箇所に集約されている)。
  // PV-READ-2 follow-up: window ルートにも同じ予約幅を書き、読書面 header
  // furniture が Windows/Linux の native 閉じるボタン帯を避ける。
  const furnitureChromeTargets = useMemo(() => [windowRootRef], [windowRootRef])
  useWindowControlsOverlayReservation({
    headerRef: headerElementRef,
    platform,
    usesNativeWindowControls,
    additionalTargetRef: dragRegionElementRef,
    additionalTargetRefs: furnitureChromeTargets,
  })

  return (
    <>
      {/* Reader Chrome: window 最上端に常時マウントされる薄い透明 hit-zone。
          header 自身の transform 状態に関わらずここに固定されているので、
          header が完全に画面外へ退避していても「window 上端への pointer
          hover」で再表示できる (header 自身の :hover に頼らない)。装飾要素
          なので aria-hidden。body の上端 padding (22px) より確実に小さい
          高さにして、本文の実際の文字と干渉しないようにする。
          P1 修正: この要素は明示的に no-drag (CSS 側) — hover 判定を
          native drag hit-test から独立させておく。 */}
      <div
        className="page-viewer-window__header-reveal-zone"
        aria-hidden="true"
        onPointerEnter={onReveal}
        onPointerDown={onReveal}
      />
      {/* P1 修正: `transform` で animate する header 自身から native drag
          hit-test を分離するための、常時固定 (transform しない) の sibling。
          `-webkit-app-region: drag` はこの要素だけが持つ (CSS 側)。header が
          auto-hide で画面外に退避していても、この要素は常にここにあるため、
          Electron の native window ドラッグが header の表示状態や transform
          位置と一切連動しない安定した挙動になる。CSS 側で右端の action 群
          + native window-controls 予約幅ぶんを幾何的に除外しているため、
          操作ボタンとこの要素は矩形として重ならない (P1 修正 2 度目)。
          P2 修正: この要素は純粋な native drag surface 専用とし、
          `onPointerEnter` / `onPointerDown` は置かない — native drag 領域に
          DOM の pointer handler を混在させると、先の P1 修正で解消した
          native hit-test と React pointer event の競合を別の形で再発させる
          おそれがある。reveal (auto-hide 解除) は上端の
          `.page-viewer-window__header-reveal-zone` の hover と、実際の
          操作ボタンの pointerdown/focus (下の `<header>` へ bubble する)
          だけで行う。
          P1 修正 (3 度目): `data-platform` と `ref` をここにも付ける。
          win32/linux では CSS 側の `env(titlebar-area-*)` fallback (header
          と全く同じ式) を、JS 実測後は上の effect が同じ実測値を
          inline style で直接複製する ── header だけに書かれる CSS 変数を
          sibling がそのまま継承することはできないため。 */}
      <div
        ref={dragRegionElementRef}
        className="page-viewer-window__header-drag-region"
        data-platform={platform}
        aria-hidden="true"
      />
      {/* header は viewport 上の `position: absolute` overlay — 本文の
          layout 領域を一切占有しない。hidden 状態は `transform:
          translateY(-100%)` で header 全体を画面外へ退避するだけで
          (opacity では隠さない)、body/frame の寸法・column metrics には
          一切影響しない。`:focus-within` は画面外にあっても Tab focus には
          反応するので、header 内 button への Tab focus でも再表示できる。
          `data-platform` は Windows/Linux の window-controls-overlay 予約 CSS
          fallback (`env(titlebar-area-*)`) と、将来の platform 別調整のため。
          P1 修正: `onPointerEnter` はここには付けない — header 自身は
          タイトル/余白部分で `pointer-events: none` (CSS 側) になっており、
          `pointerenter` は bubble しない仕様上、この要素ではもう発火しえない。
          P2 修正: 背後の `.page-viewer-window__header-drag-region` も
          native drag surface 専用のため pointer handler を持たない ──
          タイトル/余白部分の hover だけでは reveal タイマーは更新されない
          (意図的。reveal は上端の reveal-zone hover と実操作ボタンだけが
          担う)。`onPointerDown` は残す — `pointerdown` は通常どおり bubble
          するため、header-actions 内の実際の `<button>` (pointer-events:
          auto) を押したときにここまで伝播し、「header 操作後 2.5 秒は
          隠さない」を引き続き満たす。`onFocus` も同様に bubble して Tab
          focus を拾う。 */}
      <header
        ref={headerElementRef as RefObject<HTMLElement>}
        data-platform={platform}
        className={isVisible ? 'page-viewer-window__header is-visible' : 'page-viewer-window__header'}
        onPointerDown={onReveal}
        onFocus={onReveal}
      >
        <h1 className="page-viewer-window__title">{title}</h1>
        {/* Unified Header の `.unified-header-sep` に相当する separator。
            UI theme の `--pv-ui-separator` (省略時フォールバックあり)。 */}
        <span className="page-viewer-window__header-separator" aria-hidden="true" />
        <div className="page-viewer-window__header-actions">
          <button
            type="button"
            className={
              headerPinned
                ? 'page-viewer-window__header-pin-toggle is-active'
                : 'page-viewer-window__header-pin-toggle'
            }
            onClick={onToggleHeaderPinned}
            data-tooltip={headerPinned ? 'ヘッダーの固定を解除' : 'ヘッダーを固定'}
            aria-label={headerPinned ? 'ヘッダーの固定を解除' : 'ヘッダーを固定'}
            aria-pressed={headerPinned}
          >
            {headerPinned ? (
              <IconPinned size={OUTLINE_TOGGLE_ICON_SIZE} stroke={OUTLINE_TOGGLE_ICON_STROKE} />
            ) : (
              <IconPin size={OUTLINE_TOGGLE_ICON_SIZE} stroke={OUTLINE_TOGGLE_ICON_STROKE} />
            )}
          </button>
          {/* PV-COL-12: 書字方向切替 (session-only)。メインアプリ toolbar の
              writing-mode toggle (`UnifiedHeader.tsx`) と同じ icon の使い分け
              (現在の方向を表す icon を出す) を踏襲する。押した瞬間に body へ
              focus を戻すのは outline toggle の P2 修正と同じ理由 ──
              header 内 button に focus が残ると `:focus-within` で auto-hide
              が止まり続ける。 */}
          <button
            type="button"
            className="page-viewer-window__writing-mode-toggle"
            onClick={onToggleWritingMode}
            data-tooltip={writingMode === 'vertical-rl' ? '横書きに切り替え' : '縦書きに切り替え'}
            aria-label={writingMode === 'vertical-rl' ? '横書きに切り替え' : '縦書きに切り替え'}
          >
            {writingMode === 'vertical-rl' ? (
              <IconSwitchVertical size={OUTLINE_TOGGLE_ICON_SIZE} stroke={OUTLINE_TOGGLE_ICON_STROKE} />
            ) : (
              <IconSwitchHorizontal size={OUTLINE_TOGGLE_ICON_SIZE} stroke={OUTLINE_TOGGLE_ICON_STROKE} />
            )}
          </button>
          {/* PV-COL-12: テーマ dropdown。native <select> ではなく軽量 custom
              menu (既存 `ThemeSwatchSelect` と同じ role="listbox"/"option" +
              色 swatch + 選択中 check の慣習)。ただしこの window は
              `[data-theme]` を持たない (`useAppUiState.ts` は main window にしか
              付与しない) ため、`ThemeSwatchSelect` 自身の CSS
              (`--bg-input`/`--border-input` 等の UI テーマ token 依存) はここで
              は解決できない ── outline toggle (PV-COL-9) が `.toolbar-btn-*` を
              再利用しなかったのと同じ理由で、`ThemeSwatchSelect` コンポーネント
              は再利用せず、doc-theme token だけで完結する専用 markup/CSS を
              このファイル内に自己完結させる。menu は header の DOM 子として
              置く (要件) ── 本文の page metrics には触れない `position:
              absolute` popover。popover 自体の色は Reader theme のまま
              (PV-COL-15 でも変更しない — header chrome だけが UI theme)。 */}
          <div className="page-viewer-window__theme-menu" ref={themeMenuRootRef as RefObject<HTMLDivElement>}>
            <button
              type="button"
              className={
                themeMenuOpen
                  ? 'page-viewer-window__theme-toggle is-active'
                  : 'page-viewer-window__theme-toggle'
              }
              onClick={onToggleThemeMenu}
              data-tooltip="テーマを選ぶ"
              aria-label="テーマを選ぶ"
              aria-haspopup="listbox"
              aria-expanded={themeMenuOpen}
              aria-controls={THEME_MENU_LISTBOX_ID}
            >
              <IconPalette size={OUTLINE_TOGGLE_ICON_SIZE} stroke={OUTLINE_TOGGLE_ICON_STROKE} />
            </button>
            {themeMenuOpen ? (
              <ul
                id={THEME_MENU_LISTBOX_ID}
                role="listbox"
                aria-label="テーマ"
                className="page-viewer-window__theme-menu-list"
              >
                {PAGE_VIEWER_READER_THEME_OPTIONS.map((theme) => {
                  const isSelected = theme === readerTheme
                  const colors = resolvePageViewerReaderThemeColors(theme, documentThemeColors)
                  return (
                    <li
                      key={theme}
                      role="option"
                      aria-selected={isSelected}
                      className={
                        isSelected
                          ? 'page-viewer-window__theme-menu-option is-selected'
                          : 'page-viewer-window__theme-menu-option'
                      }
                    >
                      <button
                        type="button"
                        className="page-viewer-window__theme-menu-option-btn"
                        onClick={() => onSelectReaderTheme(theme)}
                      >
                        <span className="page-viewer-window__theme-menu-swatches" aria-hidden="true">
                          <span
                            className="page-viewer-window__theme-menu-swatch"
                            style={{ backgroundColor: colors.pageColor }}
                          />
                          <span
                            className="page-viewer-window__theme-menu-swatch"
                            style={{ backgroundColor: colors.headingColor }}
                          />
                        </span>
                        <span className="page-viewer-window__theme-menu-option-label">
                          {PAGE_VIEWER_READER_THEME_LABELS[theme]}
                        </span>
                        <span className="page-viewer-window__theme-menu-option-check" aria-hidden="true">
                          {isSelected && <IconCheck size={12} stroke={2} />}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            ) : null}
          </div>
          {/* PV-COL-16: ページ遷移アニメーション dropdown。テーマ dropdown と
              同じ軽量 custom listbox (native <select> は使わない)。選択肢は
              なし / フェード / スライド / ズーム で、session-only Reader
              Control (payloadId が変わると既定のフェードへ戻る)。popover は
              header の DOM 子の position: absolute で、本文の page metrics
              には触れない。色は theme menu と同じ Reader theme token。 */}
          <div
            className="page-viewer-window__transition-menu"
            ref={transitionMenuRootRef as RefObject<HTMLDivElement>}
          >
            <button
              type="button"
              className={
                transitionMenuOpen
                  ? 'page-viewer-window__transition-toggle is-active'
                  : 'page-viewer-window__transition-toggle'
              }
              onClick={onToggleTransitionMenu}
              data-tooltip="ページ遷移アニメーション"
              aria-label="ページ遷移アニメーション"
              aria-haspopup="listbox"
              aria-expanded={transitionMenuOpen}
              aria-controls={TRANSITION_MENU_LISTBOX_ID}
            >
              <IconTransitionRight size={OUTLINE_TOGGLE_ICON_SIZE} stroke={OUTLINE_TOGGLE_ICON_STROKE} />
            </button>
            {transitionMenuOpen ? (
              <div className="page-viewer-window__transition-popover">
                <ul
                  id={TRANSITION_MENU_LISTBOX_ID}
                  role="listbox"
                  aria-label="ページ遷移アニメーション"
                  className="page-viewer-window__transition-menu-list"
                >
                  {PAGE_VIEWER_PAGE_TURN_TRANSITION_OPTIONS.map((transition) => {
                    const isSelected = transition === pageTurnTransition
                    return (
                      <li
                        key={transition}
                        role="option"
                        aria-selected={isSelected}
                        className={
                          isSelected
                            ? 'page-viewer-window__transition-menu-option is-selected'
                            : 'page-viewer-window__transition-menu-option'
                        }
                      >
                        <button
                          type="button"
                          className="page-viewer-window__transition-menu-option-btn"
                          onClick={() => onSelectPageTurnTransition(transition)}
                        >
                          <span className="page-viewer-window__transition-menu-option-label">
                            {PAGE_VIEWER_PAGE_TURN_TRANSITION_LABELS[transition]}
                          </span>
                          <span className="page-viewer-window__transition-menu-option-check" aria-hidden="true">
                            {isSelected && <IconCheck size={12} stroke={2} />}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
                {/* 第2次 follow-up: speed slider。listbox の option ではなく、
                    popover 内で listbox の兄弟となる独立した labeled control
                    にする (依頼要件: listbox 内部に入れない、ARIA を壊さ
                    ない)。`none` 選択中は disabled (無効な speed という
                    概念が無いことを UI 上も明示する)。ドラッグ中に menu を
                    閉じたり focus を奪ったりしない — 選択 (`role="option"`
                    click) とは異なる操作モデルのため、専用の change handler
                    (`onChangePageTurnSpeedMs`) だけを呼ぶ。値は次のページ
                    遷移から使われるだけで、実行中の animation を再始動
                    しない (root 側の ref 経由)。 */}
                <div className="page-viewer-window__transition-speed">
                  <label htmlFor={TRANSITION_SPEED_INPUT_ID}>
                    速度: {pageTurnSpeedMs} ms
                  </label>
                  <input
                    id={TRANSITION_SPEED_INPUT_ID}
                    type="range"
                    min={PAGE_VIEWER_PAGE_TURN_SPEED_MIN_MS}
                    max={PAGE_VIEWER_PAGE_TURN_SPEED_MAX_MS}
                    step={PAGE_VIEWER_PAGE_TURN_SPEED_STEP_MS}
                    value={pageTurnSpeedMs}
                    disabled={pageTurnTransition === 'none'}
                    aria-valuetext={`${pageTurnSpeedMs} ms`}
                    onChange={(event) => onChangePageTurnSpeedMs(Number(event.target.value))}
                  />
                </div>
              </div>
            ) : null}
          </div>
          {/* アウトライン開閉。既存 icon library (@tabler/icons-react) / tooltip
              data attribute の app-wide convention を再利用する。Escape で閉じる
              (effect 側)。 */}
          <button
            type="button"
            ref={outlineToggleRef as RefObject<HTMLButtonElement>}
            className={
              outlineOpen
                ? 'page-viewer-window__outline-toggle is-active'
                : 'page-viewer-window__outline-toggle'
            }
            onClick={onToggleOutline}
            data-tooltip={outlineOpen ? 'アウトラインを閉じる' : 'アウトラインを開く'}
            aria-label={outlineOpen ? 'アウトラインを閉じる' : 'アウトラインを開く'}
            aria-expanded={outlineOpen}
            aria-controls={OUTLINE_PANEL_ID}
          >
            <IconListTree size={OUTLINE_TOGGLE_ICON_SIZE} stroke={OUTLINE_TOGGLE_ICON_STROKE} />
          </button>
          {/* PV-SET-4A: Page Viewer Settings。永続 (settings.json) な読書用
              pagination default の入口。既存 Reader theme / ページ遷移
              dropdown と同じ軽量 custom popover (native <select> の listbox
              部分はテーマ dropdown を再利用せず自己完結、対象見出しレベルの
              select だけ native <select> を使う)。右 sidebar 化はしない ──
              本文幅を変えず CSS Columns の再計測を発生させないため。 */}
          <div
            className="page-viewer-window__settings-menu"
            ref={settingsMenuRootRef as RefObject<HTMLDivElement>}
          >
            <button
              type="button"
              className={
                settingsMenuOpen
                  ? 'page-viewer-window__settings-toggle is-active'
                  : 'page-viewer-window__settings-toggle'
              }
              onClick={onToggleSettingsMenu}
              data-tooltip="Page Viewer Settings"
              aria-label="Page Viewer Settings"
              aria-haspopup="dialog"
              aria-expanded={settingsMenuOpen}
              aria-controls={SETTINGS_POPOVER_ID}
            >
              <IconSettings size={OUTLINE_TOGGLE_ICON_SIZE} stroke={OUTLINE_TOGGLE_ICON_STROKE} />
            </button>
            {settingsMenuOpen ? (
              <div
                id={SETTINGS_POPOVER_ID}
                role="dialog"
                aria-label="Page Viewer Settings"
                className="page-viewer-window__settings-popover"
              >
                <p className="page-viewer-window__settings-popover-title">Page Viewer Settings</p>
                <p className="page-viewer-window__settings-popover-section-heading">本文・ページ</p>
                <label
                  className="page-viewer-window__settings-popover-select-row"
                  htmlFor={SETTINGS_READING_MARGIN_TOP_SELECT_ID}
                >
                  上余白
                  <select
                    id={SETTINGS_READING_MARGIN_TOP_SELECT_ID}
                    value={readingMarginTop}
                    onChange={(event) => onChangeReadingMarginTop(Number(event.target.value))}
                    data-reading-margin="top"
                  >
                    {PAGE_VIEWER_READING_MARGIN_OPTIONS.map((px) => (
                      <option key={`top-${px}`} value={px}>
                        {px}px
                      </option>
                    ))}
                  </select>
                </label>
                <label
                  className="page-viewer-window__settings-popover-select-row"
                  htmlFor={SETTINGS_READING_MARGIN_BOTTOM_SELECT_ID}
                >
                  下余白
                  <select
                    id={SETTINGS_READING_MARGIN_BOTTOM_SELECT_ID}
                    value={readingMarginBottom}
                    onChange={(event) => onChangeReadingMarginBottom(Number(event.target.value))}
                    data-reading-margin="bottom"
                  >
                    {PAGE_VIEWER_READING_MARGIN_OPTIONS.map((px) => (
                      <option key={`bottom-${px}`} value={px}>
                        {px}px
                      </option>
                    ))}
                  </select>
                </label>
                <label
                  className="page-viewer-window__settings-popover-select-row"
                  htmlFor={SETTINGS_READING_MARGIN_INLINE_SELECT_ID}
                >
                  左右余白
                  <select
                    id={SETTINGS_READING_MARGIN_INLINE_SELECT_ID}
                    value={readingMarginInline}
                    onChange={(event) => onChangeReadingMarginInline(Number(event.target.value))}
                    data-reading-margin="inline"
                  >
                    {PAGE_VIEWER_READING_MARGIN_OPTIONS.map((px) => (
                      <option key={`inline-${px}`} value={px}>
                        {px}px
                      </option>
                    ))}
                  </select>
                </label>
                <label className="page-viewer-window__settings-popover-toggle-row">
                  <input
                    type="checkbox"
                    checked={readingPaperFrame}
                    onChange={(event) => onChangeReadingPaperFrame(event.target.checked)}
                    data-reading-paper-frame
                  />
                  用紙枠
                </label>
                <p className="page-viewer-window__settings-popover-section-heading">ヘッダー</p>
                <label className="page-viewer-window__settings-popover-toggle-row">
                  <input
                    type="checkbox"
                    checked={readingHeaderEnabled}
                    onChange={(event) => onChangeReadingHeaderEnabled(event.target.checked)}
                    data-reading-header-enabled
                  />
                  ヘッダーを表示
                </label>
                <label
                  className="page-viewer-window__settings-popover-select-row"
                  htmlFor={SETTINGS_READING_HEADER_ALIGN_SELECT_ID}
                >
                  位置
                  <select
                    id={SETTINGS_READING_HEADER_ALIGN_SELECT_ID}
                    value={readingHeaderAlign}
                    disabled={!readingHeaderEnabled}
                    onChange={(event) =>
                      onChangeReadingHeaderAlign(event.target.value as PageViewerReadingFurnitureAlign)
                    }
                    data-reading-header-align
                  >
                    {PAGE_VIEWER_READING_FURNITURE_ALIGN_OPTIONS.map((align) => (
                      <option key={`header-align-${align}`} value={align}>
                        {FURNITURE_ALIGN_LABELS[align]}
                      </option>
                    ))}
                  </select>
                </label>
                <label
                  className="page-viewer-window__settings-popover-select-row"
                  htmlFor={SETTINGS_READING_HEADER_CONTENT_SELECT_ID}
                >
                  内容
                  <select
                    id={SETTINGS_READING_HEADER_CONTENT_SELECT_ID}
                    value={readingHeaderContent}
                    disabled={!readingHeaderEnabled}
                    onChange={(event) =>
                      onChangeReadingHeaderContent(
                        event.target.value as PageViewerReadingHeaderContent,
                      )
                    }
                    data-reading-header-content
                  >
                    {PAGE_VIEWER_READING_HEADER_CONTENT_OPTIONS.map((content) => (
                      <option key={`header-content-${content}`} value={content}>
                        {FURNITURE_CONTENT_LABELS[content]}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="page-viewer-window__settings-popover-section-heading">フッター</p>
                <label className="page-viewer-window__settings-popover-toggle-row">
                  <input
                    type="checkbox"
                    checked={readingFooterEnabled}
                    onChange={(event) => onChangeReadingFooterEnabled(event.target.checked)}
                    data-reading-footer-enabled
                  />
                  フッターを表示
                </label>
                <label
                  className="page-viewer-window__settings-popover-select-row"
                  htmlFor={SETTINGS_READING_FOOTER_ALIGN_SELECT_ID}
                >
                  位置
                  <select
                    id={SETTINGS_READING_FOOTER_ALIGN_SELECT_ID}
                    value={readingFooterAlign}
                    disabled={!readingFooterEnabled}
                    onChange={(event) =>
                      onChangeReadingFooterAlign(event.target.value as PageViewerReadingFurnitureAlign)
                    }
                    data-reading-footer-align
                  >
                    {PAGE_VIEWER_READING_FURNITURE_ALIGN_OPTIONS.map((align) => (
                      <option key={`footer-align-${align}`} value={align}>
                        {FURNITURE_ALIGN_LABELS[align]}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="page-viewer-window__settings-popover-section-heading">簡易表紙</p>
                <label className="page-viewer-window__settings-popover-toggle-row">
                  <input
                    type="checkbox"
                    checked={readingSimpleCoverEnabled}
                    onChange={(event) => onChangeReadingSimpleCoverEnabled(event.target.checked)}
                    data-reading-simple-cover-enabled
                  />
                  簡易表紙を表示
                </label>
                <label
                  className="page-viewer-window__settings-popover-select-row"
                  htmlFor={SETTINGS_READING_SIMPLE_COVER_WRITING_MODE_SELECT_ID}
                >
                  書字方向
                  <select
                    id={SETTINGS_READING_SIMPLE_COVER_WRITING_MODE_SELECT_ID}
                    value={readingSimpleCoverWritingMode}
                    disabled={!readingSimpleCoverEnabled}
                    onChange={(event) =>
                      onChangeReadingSimpleCoverWritingMode(
                        event.target.value as PageViewerReadingSimpleCoverWritingMode,
                      )
                    }
                    data-reading-simple-cover-writing-mode
                  >
                    {PAGE_VIEWER_READING_SIMPLE_COVER_WRITING_MODE_OPTIONS.map((writingMode) => (
                      <option key={writingMode} value={writingMode}>
                        {SIMPLE_COVER_WRITING_MODE_LABELS[writingMode]}
                      </option>
                    ))}
                  </select>
                </label>
                <label
                  className="page-viewer-window__settings-popover-select-row"
                  htmlFor={SETTINGS_READING_SIMPLE_COVER_LAYOUT_SELECT_ID}
                >
                  配置
                  <select
                    id={SETTINGS_READING_SIMPLE_COVER_LAYOUT_SELECT_ID}
                    value={readingSimpleCoverLayout}
                    disabled={!readingSimpleCoverEnabled}
                    onChange={(event) =>
                      onChangeReadingSimpleCoverLayout(
                        event.target.value as PageViewerReadingSimpleCoverLayout,
                      )
                    }
                    data-reading-simple-cover-layout
                  >
                    {PAGE_VIEWER_READING_SIMPLE_COVER_LAYOUT_OPTIONS.map((layout) => (
                      <option key={layout} value={layout}>
                        {SIMPLE_COVER_LAYOUT_LABELS[layout]}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="page-viewer-window__settings-popover-section-heading">ページ構成</p>
                <label className="page-viewer-window__settings-popover-toggle-row">
                  <input
                    type="checkbox"
                    checked={headingPageBreakEnabled}
                    onChange={(event) => onChangeHeadingPageBreakEnabled(event.target.checked)}
                  />
                  見出しの前で改ページ
                </label>
                <label
                  className="page-viewer-window__settings-popover-select-row"
                  htmlFor={SETTINGS_HEADING_LEVEL_SELECT_ID}
                >
                  対象見出し
                  <select
                    id={SETTINGS_HEADING_LEVEL_SELECT_ID}
                    value={headingPageBreakMaxLevel}
                    disabled={!headingPageBreakEnabled}
                    onChange={(event) => onChangeHeadingPageBreakMaxLevel(Number(event.target.value))}
                  >
                    <option value={1}>H1のみ</option>
                    <option value={2}>H1〜H2</option>
                    <option value={3}>H1〜H3</option>
                    <option value={4}>H1〜H4</option>
                    <option value={5}>H1〜H5</option>
                    <option value={6}>H1〜H6</option>
                  </select>
                </label>
              </div>
            ) : null}
          </div>
        </div>
      </header>
    </>
  )
}

function PageViewerOutlinePanel({
  open,
  panelRef,
  headings,
  onActivate,
}: {
  open: boolean
  panelRef: RefObject<HTMLElement | null>
  headings: readonly PageViewAnchor[]
  onActivate: (anchorId: string) => void
}) {
  // React の JSX 型定義に `inert` が無い環境でも、閉じている間は pointer / Tab /
  // a11y tree から除外する (PV-COL-13)。aria-hidden と CSS pointer-events と併用。
  useEffect(() => {
    const el = panelRef.current
    if (!el) return
    if (!open) el.setAttribute('inert', '')
    else el.removeAttribute('inert')
  }, [open, panelRef])

  return (
    <aside
      id={OUTLINE_PANEL_ID}
      ref={panelRef as RefObject<HTMLElement>}
      className={
        open ? 'page-viewer-window__outline-panel is-open' : 'page-viewer-window__outline-panel'
      }
      aria-label="アウトライン"
      aria-hidden={!open}
    >
      {headings.length === 0 ? (
        <div className="page-viewer-window__outline-empty">見出しがありません</div>
      ) : (
        <ul className="page-viewer-window__outline-list">
          {headings.map((heading, index) => {
            const previous = index > 0 ? headings[index - 1] : undefined
            // Book chapter 境界の視覚区別 (要件: manifest metadata の SoT は
            // 変えない — 表示だけの区切り線)。active document 由来
            // (chapterIndex が常に undefined) では発火しない。
            const chapterBoundary =
              previous !== undefined &&
              heading.chapterIndex !== undefined &&
              heading.chapterIndex !== previous.chapterIndex
            return (
              <li
                key={heading.id}
                className={`page-viewer-window__outline-item page-viewer-window__outline-item--level-${heading.level ?? 1}`}
                data-outline-chapter-boundary={chapterBoundary ? 'true' : undefined}
              >
                <button
                  type="button"
                  className="page-viewer-window__outline-link"
                  onClick={() => onActivate(heading.id)}
                >
                  {heading.label}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </aside>
  )
}

function PageViewerSequenceItem({
  item,
  itemIndex,
  isActive,
  localPageIndex,
  writingMode,
  onFlowPageCountChange,
  flowPageCountRegistrationGeneration,
  headingAnchorIdsByBlockId,
  onTocEntryActivate,
  imageScope,
  autoTcy,
  showRoleLabels,
  readingSurfaceReflowGeneration,
  onReadingSurfaceMeasure,
  simpleCoverWritingMode,
  simpleCoverLayout,
}: {
  item: PageViewItem
  itemIndex: number
  isActive: boolean
  localPageIndex: number
  writingMode: WritingMode
  onFlowPageCountChange: (sectionId: string, pageCount: number) => void
  flowPageCountRegistrationGeneration: number
  headingAnchorIdsByBlockId: ReadonlyMap<string, string>
  onTocEntryActivate: (anchorId: string) => void
  imageScope?: PageViewerImageScope
  autoTcy?: PageViewerAutoTcyRenderOptions
  showRoleLabels: boolean
  readingSurfaceReflowGeneration: number
  onReadingSurfaceMeasure: (sectionId: string, generation: number) => void
  simpleCoverWritingMode: PageViewerReadingSimpleCoverWritingMode
  simpleCoverLayout: PageViewerReadingSimpleCoverLayout
}) {
  if (item.kind === 'fixedBlankPage') {
    return (
      <PageViewerFixedBlankPageFrame
        item={item}
        itemIndex={itemIndex}
        isActive={isActive}
        localPageIndex={localPageIndex}
      />
    )
  }
  if (item.kind === 'fixedSyntheticPage') {
    return (
      <PageViewerSimpleCoverFrame
        item={item}
        itemIndex={itemIndex}
        isActive={isActive}
        viewerWritingMode={writingMode}
        coverWritingMode={simpleCoverWritingMode}
        layout={simpleCoverLayout}
        showRoleLabels={showRoleLabels}
      />
    )
  }
  return (
    <PageViewerFlowFrame
      item={item}
      itemIndex={itemIndex}
      isActive={isActive}
      localPageIndex={localPageIndex}
      writingMode={writingMode}
      onFlowPageCountChange={onFlowPageCountChange}
      flowPageCountRegistrationGeneration={flowPageCountRegistrationGeneration}
      headingAnchorIdsByBlockId={headingAnchorIdsByBlockId}
      onTocEntryActivate={onTocEntryActivate}
      imageScope={imageScope}
      autoTcy={autoTcy}
      showRoleLabels={showRoleLabels}
      readingSurfaceReflowGeneration={readingSurfaceReflowGeneration}
      onReadingSurfaceMeasure={onReadingSurfaceMeasure}
    />
  )
}

function PageViewerFlowFrame({
  item,
  itemIndex,
  isActive,
  localPageIndex,
  writingMode,
  onFlowPageCountChange,
  flowPageCountRegistrationGeneration,
  headingAnchorIdsByBlockId,
  onTocEntryActivate,
  imageScope,
  autoTcy,
  showRoleLabels,
  readingSurfaceReflowGeneration,
  onReadingSurfaceMeasure,
}: {
  item: Extract<PageViewItem, { kind: 'flow' | 'synthetic' }>
  itemIndex: number
  isActive: boolean
  localPageIndex: number
  writingMode: WritingMode
  onFlowPageCountChange: (sectionId: string, pageCount: number) => void
  flowPageCountRegistrationGeneration: number
  headingAnchorIdsByBlockId: ReadonlyMap<string, string>
  onTocEntryActivate: (anchorId: string) => void
  imageScope?: PageViewerImageScope
  autoTcy?: PageViewerAutoTcyRenderOptions
  showRoleLabels: boolean
  readingSurfaceReflowGeneration: number
  onReadingSurfaceMeasure: (sectionId: string, generation: number) => void
}) {
  const frameRef = useRef<HTMLDivElement | null>(null)
  const flowRef = useRef<HTMLDivElement | null>(null)
  const { metrics, measuredToken, goToPage, scheduleMeasure } = usePageViewerColumnLayout({
    frameRef,
    flowRef,
    writingMode,
    contentKey: item,
    measureToken: readingSurfaceReflowGeneration,
  })
  const imageBaseToken = item.kind === 'flow' && item.chapterId
    ? imageScope?.chapterBaseTokens?.[item.chapterId]
    : imageScope?.defaultBaseToken

  useLayoutEffect(() => {
    goToPage(isActive ? localPageIndex : 0)
  }, [goToPage, isActive, localPageIndex, metrics?.pageCount])

  // PV-SET-4A 回帰修正: `item` (= `usePageViewerColumnLayout` の `contentKey`)
  // 自体を依存に含める。`viewModel` が再構成される (歯車 popover の設定変更等)
  // たびに `item.sectionId` と `metrics?.pageCount` の値がたまたま以前と同じに
  // なることがあり (例: H1のみ → H1〜H2 だが実際には H2 見出しが無く総ページ数が
  // 変わらない場合)、その場合はこの effect の依存が値として変化しないため
  // 再実行されず、`usePageViewerPageSequence` が `items` identity 変更で
  // リセットした `flowPageCounts`（親側 state）へこの section を登録し直す
  // 通知が失われていた。結果として親は該当 section を暫定 1 ページのまま扱い
  // 続け、global page sequence の再集計が壊れて PageDown / scrubber で
  // 2 ページ目以降へ進めなくなっていた。`item` は `viewModel` 再構成のたびに
  // 新しい object identity になるため、これを依存に加えることで
  // sectionId / pageCount の値が偶然一致していても通知を確実に再発行する。
  useEffect(() => {
    onFlowPageCountChange(item.sectionId, metrics?.pageCount ?? 1)
  }, [item, metrics?.pageCount, onFlowPageCountChange, flowPageCountRegistrationGeneration])

  // PV-READ-1 の reading-surface acknowledgement は通常の page-count
  // 登録とは別 effect に保つ。見出し前改ページなどの viewModel 再構成で親側が
  // flowPageCounts を reset した後、上の既存登録 contract が改めて page count を
  // 入れ直す順序を崩さない。
  useEffect(() => {
    // 読書面設定のratio復元は、実frameの再計測結果をPageSequenceへ反映した後だけ
    // 許可する。token変更直後の旧metrics renderではackしない。
    if (measuredToken === readingSurfaceReflowGeneration) {
      onReadingSurfaceMeasure(item.sectionId, readingSurfaceReflowGeneration)
    }
  }, [item.sectionId, measuredToken, onReadingSurfaceMeasure, readingSurfaceReflowGeneration])

  return (
    <div
      className="page-viewer-window__page-frame page-viewer-window__page-frame--flow"
      data-page-sequence-active={isActive ? 'true' : 'false'}
      data-page-sequence-kind="flow"
      data-page-sequence-item-index={itemIndex}
      data-section-id={item.sectionId}
      data-local-page-index={isActive ? localPageIndex : 0}
      aria-hidden={!isActive}
      ref={frameRef}
    >
      <div className="page-viewer-window__page-flow" ref={flowRef}>
        <PageViewerSectionView
          item={item}
          headingAnchorIdsByBlockId={headingAnchorIdsByBlockId}
          onTocEntryActivate={onTocEntryActivate}
          imageScope={imageScope}
          imageBaseToken={imageBaseToken}
          onImageSettled={scheduleMeasure}
          autoTcy={autoTcy}
          showRoleLabels={showRoleLabels}
        />
      </div>
    </div>
  )
}

function PageViewerFixedBlankPageFrame({
  item,
  itemIndex,
  isActive,
  localPageIndex,
}: {
  item: Extract<PageViewItem, { kind: 'fixedBlankPage' }>
  itemIndex: number
  isActive: boolean
  localPageIndex: number
}) {
  return (
    <div
      className="page-viewer-window__page-frame page-viewer-window__page-frame--fixed-blank"
      data-page-sequence-active={isActive ? 'true' : 'false'}
      data-page-sequence-kind="fixedBlankPage"
      data-page-sequence-item-index={itemIndex}
      data-section-id={item.sectionId}
      data-local-page-index={isActive ? localPageIndex : 0}
      aria-hidden={!isActive}
    >
      <section
        className="page-viewer-window__section page-viewer-window__section--blank"
        data-section-id={item.sectionId}
      >
        {item.pages.map((page) => (
          <div
            key={page.id}
            className="page-viewer-window__blank-page"
            data-blank-page-active={isActive && page.pageIndex === localPageIndex ? 'true' : 'false'}
            data-blank-page-local-index={page.pageIndex}
          />
        ))}
      </section>
    </div>
  )
}

function PageViewerSectionView({
  item,
  headingAnchorIdsByBlockId,
  onTocEntryActivate,
  imageScope,
  imageBaseToken,
  onImageSettled,
  autoTcy,
  showRoleLabels,
}: {
  item: Exclude<PageViewItem, { kind: 'fixedBlankPage' }>
  headingAnchorIdsByBlockId: ReadonlyMap<string, string>
  onTocEntryActivate: (anchorId: string) => void
  imageScope?: PageViewerImageScope
  imageBaseToken?: string
  onImageSettled: () => void
  autoTcy?: PageViewerAutoTcyRenderOptions
  showRoleLabels: boolean
}) {
  switch (item.kind) {
    case 'flow':
      return (
        <section
          className="page-viewer-window__section page-viewer-window__section--flow"
          data-section-id={item.sectionId}
        >
          {item.blocks.map((block) =>
            renderPageViewerFlowBlock(block, {
              breakBeforeStyle: 'column',
              anchorId: headingAnchorIdsByBlockId.get(block.id),
              imageScope,
              imageBaseToken,
              onImageSettled,
              autoTcy,
            }),
          )}
        </section>
      )
    case 'synthetic':
      return (
        <section
          className="page-viewer-window__section page-viewer-window__section--synthetic"
          data-section-id={item.sectionId}
          data-synthetic-role={item.role}
        >
          <PageViewerSyntheticView
            item={item}
            onTocEntryActivate={onTocEntryActivate}
            showRoleLabels={showRoleLabels}
          />
        </section>
      )
  }
}

function formatPageViewerCredit(roleLabel: string, value: string, showRoleLabels: boolean): string {
  return showRoleLabels ? `${roleLabel}${value}` : value
}

function PageViewerSyntheticView({
  item,
  onTocEntryActivate,
  showRoleLabels,
}: {
  item: PageViewSyntheticItem
  onTocEntryActivate: (anchorId: string) => void
  showRoleLabels: boolean
}) {
  switch (item.role) {
    case 'documentInfo':
    case 'bookInfo':
      return (
        <div
          className={
            item.role === 'documentInfo'
              ? 'page-viewer-window__info page-viewer-window__info--document'
              : 'page-viewer-window__info page-viewer-window__info--book'
          }
        >
          {item.entries.map((entry, index) => (
            <div key={index} className="page-viewer-window__info-entry">
              {entry.title?.trim() ? (
                <div className="page-viewer-window__info-title">{entry.title}</div>
              ) : null}
              {entry.author?.trim() ? (
                <div className="page-viewer-window__info-credit">
                  {formatPageViewerCredit('著　', entry.author, showRoleLabels)}
                </div>
              ) : null}
              {entry.translator?.trim() ? (
                <div className="page-viewer-window__info-credit">
                  {formatPageViewerCredit('訳　', entry.translator, showRoleLabels)}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )
    case 'chapterInfo':
      return (
        <div className="page-viewer-window__info page-viewer-window__info--chapter">
          {item.entries.map((entry) => {
            const authors = (entry.authors ?? []).map((value) => value.trim()).filter(Boolean)
            const translators = (entry.translators ?? []).map((value) => value.trim()).filter(Boolean)
            const title = entry.title?.trim() ?? ''
            return (
              <div key={entry.chapterId} className="page-viewer-window__info-entry">
                {title ? <div className="page-viewer-window__info-title">{title}</div> : null}
                {authors.length > 0 ? (
                  <div className="page-viewer-window__info-credit">
                    {formatPageViewerCredit('著　', authors.join('、'), showRoleLabels)}
                  </div>
                ) : null}
                {translators.length > 0 ? (
                  <div className="page-viewer-window__info-credit">
                    {formatPageViewerCredit('訳　', translators.join('、'), showRoleLabels)}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      )
    case 'toc':
      return (
        <nav className="page-viewer-window__toc" aria-label="目次">
          <div className="page-viewer-window__toc-heading">目次</div>
          <ul className="page-viewer-window__toc-list">
            {item.entries.map((entry) => (
              <li
                key={entry.anchorId}
                className={`page-viewer-window__toc-item page-viewer-window__toc-item--level-${entry.level}`}
              >
                <button
                  type="button"
                  className="page-viewer-window__toc-link"
                  onClick={() => onTocEntryActivate(entry.anchorId)}
                >
                  {entry.text}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )
  }
}
