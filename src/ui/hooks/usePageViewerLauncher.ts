import { useCallback, useMemo, type RefObject } from 'react'
import type { EditorCoreHandle } from '../../editor-core/types'
import type { EditorTab } from './useAppUiState'
import type {
  DisplaySettings,
  DocumentColorSettings,
  DocumentFontPreset,
  DocumentHeadingFont,
  WritingMode,
} from '../../settings/types'
import type {
  PageViewerMetadataDisplaySnapshot,
  PageViewerSnapshotRequest,
} from '../page-viewer/pageViewerTypes'
import { buildPageViewerMetadataDisplaySnapshot } from '../page-viewer/pageViewerMetadataDisplay'
import { capturePageViewerUiThemeSnapshot, type PageViewerUiThemeSnapshot } from '../page-viewer/pageViewerUiTheme'
import {
  normalizePageViewerBreakBeforeHeading,
  normalizePageViewerBreakBeforeHeadingMaxLevel,
} from '../../settings/pageViewerHeadingPaginationSettings'
import {
  normalizePageViewerReadingFooterAlign,
  normalizePageViewerReadingFooterEnabled,
  normalizePageViewerReadingHeaderAlign,
  normalizePageViewerReadingHeaderContent,
  normalizePageViewerReadingHeaderEnabled,
  normalizePageViewerReadingMarginBottom,
  normalizePageViewerReadingMarginInline,
  normalizePageViewerReadingMarginTop,
  normalizePageViewerReadingPaperFrame,
  normalizePageViewerReadingSimpleCoverEnabled,
  normalizePageViewerReadingSimpleCoverLayout,
  normalizePageViewerReadingSimpleCoverWritingMode,
} from '../../settings/pageViewerReadingSurfaceSettings'

export type { PageViewerMetadataDisplaySnapshot }
export { buildPageViewerMetadataDisplaySnapshot }

export type PageViewerAppearanceSnapshot = Pick<
  PageViewerSnapshotRequest,
  | 'includeTableOfContents'
  | 'writingMode'
  | 'pageColor'
  | 'textColor'
  | 'headingColor'
  | 'fontFamily'
  | 'fontSize'
  | 'lineHeight'
  | 'headingFontFamily'
  | 'headingMarginAfter'
  | 'headingDividerLevels'
  | 'headingAlignHorizontal'
  | 'headingAlignVertical'
  | 'rubySize'
  | 'autoTcyEnabled'
  | 'autoTcyNumbersOnly'
  | 'autoTcyMinDigits'
  | 'autoTcyMaxDigits'
>

type PageViewerAppearanceInput = {
  writingMode: WritingMode
  docColorSettings: Pick<DocumentColorSettings, 'pageColor' | 'textColor' | 'headingColor'>
  docFontPreset: DocumentFontPreset
  selectedFont: string | null
  /** `same-as-body` / `mincho` / `gothic` / `custom:...` (Display Settings の見出しフォント)。 */
  docHeadingFont: DocumentHeadingFont
  displaySettings: Pick<
    DisplaySettings,
    | 'fontSize'
    | 'lineHeight'
    | 'headingMarginAfter'
    | 'headingDividerLevels'
    | 'headingAlignHorizontal'
    | 'headingAlignVertical'
    | 'rubySize'
    | 'autoTcyEnabled'
    | 'autoTcyNumbersOnly'
    | 'autoTcyMinDigits'
    | 'autoTcyMaxDigits'
  >
}

type UsePageViewerLauncherInput = {
  coreRef: RefObject<EditorCoreHandle | null>
  activeTab: EditorTab
  internalDocActive: boolean
  writingMode: WritingMode
  /** 本文の背景色 / 文字色 / 見出し色 (open 時点の値を snapshot するだけ)。 */
  docColorSettings: DocumentColorSettings
  /** 本文フォントの選択 (mincho / gothic / custom:... / ui-linked)。 */
  docFontPreset: DocumentFontPreset
  /** `docFontPreset` が `ui-linked` のときに使う実フォント名。 */
  selectedFont: string | null
  /** 見出しフォントの選択 (`same-as-body` / mincho / gothic / custom:...)。 */
  docHeadingFont: DocumentHeadingFont
  /** `fontSize` / `lineHeight` / 見出し・ルビ表示設定の snapshot 元。 */
  displaySettings: DisplaySettings
  /** PV-SET-2: metadata field visibility（settings.json の既存 frontmatter*）。 */
  frontmatterVisible: boolean
  frontmatterShowAuthors: boolean
  frontmatterShowTranslators: boolean
  frontmatterShowRoleLabels: boolean
}

/**
 * PV-COL-15: この (main) window が現在適用している UI theme (標準 / custom
 * 問わず) から、Page Viewer header chrome 用の token だけを snapshot する。
 * `useAppUiState.ts` の theme 適用経路 (`data-theme` 属性 + custom theme 用の
 * 個別 `style.setProperty` 群) を再実装せず、その **結果** である
 * `getComputedStyle(document.documentElement)` を読むだけ ── 標準テーマ /
 * custom テーマのどちらでも同じ 1 経路で正しい値が取れる。
 * `capturePageViewerUiThemeSnapshot` (pure) 自体は DOM を読まないので、
 * DOM 読み取りはこの 1 関数だけに閉じ込める。
 */
export function capturePageViewerUiThemeSnapshotFromMainWindow(): PageViewerUiThemeSnapshot {
  const rootStyle = getComputedStyle(document.documentElement)
  return capturePageViewerUiThemeSnapshot((cssVarName) => rootStyle.getPropertyValue(cssVarName))
}

/**
 * PV-SET-4A / PV-READ-1 / PV-READ-2: Page Viewer 読書用 settings の open-time snapshot。
 * 見出し前改ページ・読書面（余白・用紙枠）・furniture（header/footer）を同居させる。
 */
export type PageViewerReadingSettingsSnapshot = {
  pageViewerBreakBeforeHeading?: boolean
  pageViewerBreakBeforeHeadingMaxLevel?: number
  pageViewerReadingMarginTop?: number
  pageViewerReadingMarginBottom?: number
  pageViewerReadingMarginInline?: number
  pageViewerReadingPaperFrame?: boolean
  pageViewerReadingHeaderEnabled?: boolean
  pageViewerReadingHeaderAlign?: 'start' | 'center' | 'end'
  pageViewerReadingHeaderContent?: 'title' | 'title-author'
  pageViewerReadingFooterEnabled?: boolean
  pageViewerReadingFooterAlign?: 'start' | 'center' | 'end'
  pageViewerReadingSimpleCoverEnabled?: boolean
  pageViewerReadingSimpleCoverWritingMode?: 'inherit' | 'vertical-rl' | 'horizontal-tb'
  pageViewerReadingSimpleCoverLayout?: 'normal' | 'center'
}

/**
 * settings.json の永続読書設定を、Viewer を新たに開く瞬間に fresh に読む。
 * この設定を編集する UI は main window 側には無く (歯車 popover は Page Viewer
 * window 自身にしか無い)、別の Page Viewer window が直前に保存した最新値を
 * 毎回読み直す必要があるため、`useAppUiState.ts` のマウント時 state には持たせず、
 * 都度 IPC で読む。
 */
export async function readPageViewerReadingSettingsSnapshot(): Promise<PageViewerReadingSettingsSnapshot> {
  const bridge = window.nyozeBridge?.settings?.read
  if (!bridge) return {}
  try {
    const raw = await bridge()
    if (!raw) return {}
    return {
      pageViewerBreakBeforeHeading: normalizePageViewerBreakBeforeHeading(raw.pageViewerBreakBeforeHeading),
      pageViewerBreakBeforeHeadingMaxLevel: normalizePageViewerBreakBeforeHeadingMaxLevel(
        raw.pageViewerBreakBeforeHeadingMaxLevel,
      ),
      pageViewerReadingMarginTop: normalizePageViewerReadingMarginTop(raw.pageViewerReadingMarginTop),
      pageViewerReadingMarginBottom: normalizePageViewerReadingMarginBottom(raw.pageViewerReadingMarginBottom),
      pageViewerReadingMarginInline: normalizePageViewerReadingMarginInline(raw.pageViewerReadingMarginInline),
      pageViewerReadingPaperFrame: normalizePageViewerReadingPaperFrame(raw.pageViewerReadingPaperFrame),
      pageViewerReadingHeaderEnabled: normalizePageViewerReadingHeaderEnabled(raw.pageViewerReadingHeaderEnabled),
      pageViewerReadingHeaderAlign: normalizePageViewerReadingHeaderAlign(raw.pageViewerReadingHeaderAlign),
      pageViewerReadingHeaderContent: normalizePageViewerReadingHeaderContent(raw.pageViewerReadingHeaderContent),
      pageViewerReadingFooterEnabled: normalizePageViewerReadingFooterEnabled(raw.pageViewerReadingFooterEnabled),
      pageViewerReadingFooterAlign: normalizePageViewerReadingFooterAlign(raw.pageViewerReadingFooterAlign),
      pageViewerReadingSimpleCoverEnabled: normalizePageViewerReadingSimpleCoverEnabled(
        raw.pageViewerReadingSimpleCoverEnabled,
      ),
      pageViewerReadingSimpleCoverWritingMode: normalizePageViewerReadingSimpleCoverWritingMode(
        raw.pageViewerReadingSimpleCoverWritingMode,
      ),
      pageViewerReadingSimpleCoverLayout: normalizePageViewerReadingSimpleCoverLayout(
        raw.pageViewerReadingSimpleCoverLayout,
      ),
    }
  } catch {
    return {}
  }
}

/** `activeTab.title`（拡張子付きファイル名 or 無題タブ名）から viewer window の title を作る。 */
function derivePageViewerTitle(tabTitle: string): string {
  const dot = tabTitle.lastIndexOf('.')
  return dot > 0 ? tabTitle.slice(0, dot) : tabTitle
}

/**
 * 本文フォントの実 font-family 文字列を解決する。`Workspace.tsx` の
 * `docFontFamily` (editor 本体の本文フォント解決ロジック) と同じ規則:
 * mincho / gothic は `styles.css` の `--font-stack-*` (`:root` 定義、
 * どの window でも解決できる) を参照し、custom はそのままフォント名、
 * `ui-linked` は `selectedFont` (無ければ mincho) にフォールバックする。
 */
function resolvePageViewerFontFamily(
  docFontPreset: DocumentFontPreset,
  selectedFont: string | null,
): string {
  if (docFontPreset === 'mincho') return 'var(--font-stack-mincho)'
  if (docFontPreset === 'gothic') return 'var(--font-stack-gothic)'
  if (docFontPreset.startsWith('custom:')) return docFontPreset.slice('custom:'.length)
  return selectedFont ?? 'var(--font-stack-mincho)'
}

/**
 * 見出しフォントの実 font-family 文字列を解決する。`Workspace.tsx` の
 * `headingFontFamily` (editor 本体の見出しフォント解決ロジック) と同じ規則:
 * mincho / gothic は `--font-stack-*`、custom はそのままフォント名、
 * `same-as-body` は解決済みの本文 `resolvedBodyFontFamily` と同じ値にする。
 */
function resolvePageViewerHeadingFontFamily(
  docHeadingFont: DocumentHeadingFont,
  resolvedBodyFontFamily: string,
): string {
  if (docHeadingFont === 'mincho') return 'var(--font-stack-mincho)'
  if (docHeadingFont === 'gothic') return 'var(--font-stack-gothic)'
  if (docHeadingFont.startsWith('custom:')) return docHeadingFont.slice('custom:'.length)
  return resolvedBodyFontFamily
}

export function buildPageViewerAppearanceSnapshot({
  writingMode,
  docColorSettings,
  docFontPreset,
  selectedFont,
  docHeadingFont,
  displaySettings,
}: PageViewerAppearanceInput): PageViewerAppearanceSnapshot {
  const fontFamily = resolvePageViewerFontFamily(docFontPreset, selectedFont)
  return {
    // Page Viewer 専用: 見出しがあれば TOC synthetic section を出す。
    // export options の includeTableOfContents とは別経路 (既定も別)。
    includeTableOfContents: true,
    writingMode,
    pageColor: docColorSettings.pageColor,
    textColor: docColorSettings.textColor,
    headingColor: docColorSettings.headingColor,
    fontFamily,
    fontSize: displaySettings.fontSize,
    lineHeight: displaySettings.lineHeight,
    headingFontFamily: resolvePageViewerHeadingFontFamily(docHeadingFont, fontFamily),
    headingMarginAfter: displaySettings.headingMarginAfter,
    headingDividerLevels: displaySettings.headingDividerLevels,
    headingAlignHorizontal: displaySettings.headingAlignHorizontal,
    headingAlignVertical: displaySettings.headingAlignVertical,
    rubySize: displaySettings.rubySize,
    autoTcyEnabled: displaySettings.autoTcyEnabled,
    autoTcyNumbersOnly: displaySettings.autoTcyNumbersOnly,
    autoTcyMinDigits: displaySettings.autoTcyMinDigits,
    autoTcyMaxDigits: displaySettings.autoTcyMaxDigits,
  }
}

/**
 * 軽量ページビューア (独立 BrowserWindow) を active document の Markdown
 * snapshot で開く。internal doc (help / shortcuts タブ等) では no-op にする
 * (既存 export hook 群と同じガード方針)。
 *
 * 表示設定 (writingMode / 本文の背景色・文字色・フォント・font size /
 * line-height) は open 時点の値を snapshot として payload に含めるだけで、
 * Display Settings 側の以降の変更を viewer window へ live sync することはない。
 */
export function usePageViewerLauncher({
  coreRef,
  activeTab,
  internalDocActive,
  writingMode,
  docColorSettings,
  docFontPreset,
  selectedFont,
  docHeadingFont,
  displaySettings,
  frontmatterVisible,
  frontmatterShowAuthors,
  frontmatterShowTranslators,
  frontmatterShowRoleLabels,
}: UsePageViewerLauncherInput) {
  const openPageViewer = useCallback(async () => {
    if (internalDocActive) return
    const bridge = window.nyozeBridge?.pageViewer?.openSnapshot
    if (!bridge) return
    const markdown = coreRef.current?.peekMarkdown()
    if (markdown === undefined) return

    const appearance = buildPageViewerAppearanceSnapshot({
      writingMode,
      docColorSettings: {
        pageColor: docColorSettings.pageColor,
        textColor: docColorSettings.textColor,
        headingColor: docColorSettings.headingColor,
      },
      docFontPreset,
      selectedFont,
      docHeadingFont,
      displaySettings: {
        fontSize: displaySettings.fontSize,
        lineHeight: displaySettings.lineHeight,
        headingMarginAfter: displaySettings.headingMarginAfter,
        headingDividerLevels: displaySettings.headingDividerLevels,
        headingAlignHorizontal: displaySettings.headingAlignHorizontal,
        headingAlignVertical: displaySettings.headingAlignVertical,
        rubySize: displaySettings.rubySize,
        autoTcyEnabled: displaySettings.autoTcyEnabled,
        autoTcyNumbersOnly: displaySettings.autoTcyNumbersOnly,
        autoTcyMinDigits: displaySettings.autoTcyMinDigits,
        autoTcyMaxDigits: displaySettings.autoTcyMaxDigits,
      },
    })

    const metadataDisplay = buildPageViewerMetadataDisplaySnapshot({
      frontmatterVisible,
      frontmatterShowAuthors,
      frontmatterShowTranslators,
      frontmatterShowRoleLabels,
    })

    // PV-SET-4A: 読書用 heading pagination default は open-time snapshot として
    // fresh に読む (歯車 popover が別の Viewer window で保存した最新値を拾う)。
    const readingSettings = await readPageViewerReadingSettingsSnapshot()

    await bridge({
      title: derivePageViewerTitle(activeTab.title),
      markdown,
      documentInfo: {
        title: activeTab.frontmatterFields.title,
        author: activeTab.frontmatterFields.author,
        translator: activeTab.frontmatterFields.translator,
      },
      ...appearance,
      ...metadataDisplay,
      ...readingSettings,
      // PV-COL-15: header chrome だけの UI theme snapshot。live sync はしない
      // (open 時点の値に固定、appearance の他の値と同じ扱い)。
      uiTheme: capturePageViewerUiThemeSnapshotFromMainWindow(),
    })
  }, [
    activeTab.frontmatterFields,
    activeTab.title,
    coreRef,
    displaySettings.fontSize,
    displaySettings.lineHeight,
    displaySettings.headingMarginAfter,
    displaySettings.headingDividerLevels,
    displaySettings.headingAlignHorizontal,
    displaySettings.headingAlignVertical,
    displaySettings.rubySize,
    displaySettings.autoTcyEnabled,
    displaySettings.autoTcyNumbersOnly,
    displaySettings.autoTcyMinDigits,
    displaySettings.autoTcyMaxDigits,
    docColorSettings.headingColor,
    docColorSettings.pageColor,
    docColorSettings.textColor,
    docFontPreset,
    docHeadingFont,
    frontmatterShowAuthors,
    frontmatterShowRoleLabels,
    frontmatterShowTranslators,
    frontmatterVisible,
    internalDocActive,
    selectedFont,
    writingMode,
  ])

  return useMemo(() => ({ openPageViewer }), [openPageViewer])
}
