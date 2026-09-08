import {
  IconAlignCenter,
  IconAlignRight,
  IconArrowBackUp,
  IconArrowForwardUp,
  IconBlockquote,
  IconBold,
  IconIndentIncrease,
  IconLayoutDistributeHorizontal,
  IconLetterCase,
  IconSquareOff,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconSquareCheck,
  IconCode,
  IconCodeDots,
  IconDeviceFloppy,
  IconDiamond,
  IconEraser,
  IconGripHorizontal,
  IconGripVertical,
  IconFile,
  IconFilePlus,
  IconFolderOpen,
  IconH1,
  IconH2,
  IconH3,
  IconH4,
  IconH5,
  IconH6,
  IconHeading,
  IconHeadingOff,
  IconHighlight,
  IconItalic,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconLayoutSidebarRightCollapse,
  IconLayoutSidebarRightExpand,
  IconLink,
  IconCheck,
  IconList,
  IconListNumbers,
  IconListTree,
  IconPhoto,
  IconMenu2,
  IconMinus,
  IconPlus,
  IconSeparatorHorizontal,
  IconSeparatorVertical,
  IconStrikethrough,
  IconTrash,
  IconUnderline,
  IconNote,
  IconNumber123,
  IconPageBreak,
  IconX,
} from '@tabler/icons-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  MouseEventHandler,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  WheelEventHandler,
} from 'react'
import type { CommandAvailability } from '../../editor-core/types'
import type { UiLanguageMode, WritingMode } from '../../settings/types'
import { createUiTextGetter } from '../i18n/uiText'
import {
  getPlainFormattingUnavailableMessage,
  resolveFormattingButtonState,
  resolvePlainModeKind,
} from '../utils/plainModeCommandGate'
import { useWindowControlsOverlayReservation } from '../hooks/useWindowControlsOverlayReservation'
import {
  clampOffsetToBounds,
  computeToolbarScrollIndicator,
  isToolbarOverflowing,
  resolveThumbDragOffset,
  resolveToolbarPanDragOffset,
  type ToolbarViewportMetrics,
} from './unifiedHeaderToolbarOverflow'

const TOOLBAR_VIEWPORT_ID = 'unified-header-toolbar-viewport'

/** header の左上を原点とした矩形（window drag overlay の配置に使う）。 */
type HeaderRect = { left: number; top: number; width: number; height: number }

function headerRectsEqual(a: HeaderRect | null, b: HeaderRect | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height
}

const headerRectStyle = (rect: HeaderRect) => ({
  left: `${rect.left}px`,
  top: `${rect.top}px`,
  width: `${rect.width}px`,
  height: `${rect.height}px`,
})

const ICON_SIZE = 18
const ICON_STROKE = 1.1
const SHIFT_PLUS_SIZE = 9
const SHIFT_PLUS_STROKE = 2.4

function ShiftPlusIcon({ children }: { children: ReactNode }) {
  return (
    <span className='toolbar-shift-plus-icon' aria-hidden='true'>
      {children}
      <span className='toolbar-shift-plus-badge'>
        <IconPlus size={SHIFT_PLUS_SIZE} stroke={SHIFT_PLUS_STROKE} />
      </span>
    </span>
  )
}

type UnifiedHeaderProps = {
  // Pane toggles
  leftPaneOpen: boolean
  rightPaneOpen: boolean
  onToggleLeftPane: () => void
  onToggleRightPane: () => void
  // Window controls (non-native)
  usesNativeWindowControls: boolean
  onWindowMinimize: () => void
  onWindowClose: () => void
  // Platform
  platform: string
  uiLanguageMode: UiLanguageMode
  // Toolbar visibility & drag
  toolbarVisible: boolean
  onToggleToolbarVisible: () => void
  toolbarOffset: number
  onToolbarOffsetChange: (offset: number) => void
  onToolbarOffsetReset: () => void
  // Toolbar
  writingMode: WritingMode
  availability: CommandAvailability
  paragraphPlainModeActive: boolean
  fullPlainEditActive: boolean
  /** Built-in read-only internal doc (shortcut reference): hide Plain/Source affordances. */
  internalDocActive?: boolean
  onRunMarkCommand: (commandName: 'bold' | 'italic' | 'strike' | 'highlight' | 'underline') => void
  onUndo: () => void
  onRedo: () => void
  onToggleInlineCode: () => void
  onInsertHorizontalRule: () => void
  onToggleHeading: (level: number) => void
  onToggleBulletList: () => void
  onToggleOrderedList: () => void
  onToggleChecklist: () => void
  onToggleBlockquote: () => void
  onToggleCodeBlock: () => void
  /** 独自ブロック装飾を適用 / 置換する (token: align-center / indent-3 / style-letter 等)。 */
  onApplyBlockDirective: (token: string) => void
  /** 独自ブロック装飾を解除する。 */
  onRemoveBlockDirective: () => void
  /** 改ページ marker (`nyozePageBreak`) を挿入する。wrapper 装飾の apply/remove とは別の独立した挿入 action。 */
  onInsertPageBreak: () => void
  /** selection が改ページ marker のときだけ有効な削除 action。 */
  onDeletePageBreak: () => void
  /** 空白ページ marker (`nyozeBlankPage`) を挿入する。page-break とは別の独立した挿入 action。count は 1〜20 (省略時 1)。 */
  onInsertBlankPage: (count?: number) => void
  onClearFormat: () => void
  onSetOrUnsetLink: () => void
  onInsertImage: () => void
  onInsertRubyBouten: () => void
  onAddNoteAnchor: () => void
  onToggleTcy: () => void
  onShowEditorInlineHint: (message: string) => void
  onLoad: MouseEventHandler<HTMLButtonElement>
  onSave: MouseEventHandler<HTMLButtonElement>
  // Menu (Win/Linux)
  onOpenAppMenu: () => void
  appTitleVisible: boolean
  appTitleText: string
  /** 同一 Book 内の前後章ボタン（前章 / 次章）。logic は container 側に閉じる。 */
  chapterNavSlot?: ReactNode
}

export function UnifiedHeader({
  leftPaneOpen,
  rightPaneOpen,
  onToggleLeftPane,
  onToggleRightPane,
  usesNativeWindowControls,
  onWindowMinimize,
  onWindowClose,
  platform,
  uiLanguageMode,
  toolbarVisible,
  onToggleToolbarVisible,
  toolbarOffset,
  onToolbarOffsetChange,
  onToolbarOffsetReset,
  writingMode,
  availability,
  paragraphPlainModeActive,
  fullPlainEditActive,
  internalDocActive = false,
  onRunMarkCommand,
  onUndo,
  onRedo,
  onToggleInlineCode,
  onInsertHorizontalRule,
  onToggleHeading,
  onToggleBulletList,
  onToggleOrderedList,
  onToggleChecklist,
  onToggleBlockquote,
  onToggleCodeBlock,
  onApplyBlockDirective,
  onRemoveBlockDirective,
  onInsertPageBreak,
  onDeletePageBreak,
  onInsertBlankPage,
  onClearFormat,
  onSetOrUnsetLink,
  onInsertImage,
  onInsertRubyBouten,
  onAddNoteAnchor,
  onToggleTcy,
  onShowEditorInlineHint,
  onLoad,
  onSave,
  onOpenAppMenu,
  appTitleVisible,
  appTitleText,
  chapterNavSlot,
}: UnifiedHeaderProps) {
  const t = createUiTextGetter(uiLanguageMode)
  const isVertical = writingMode === 'vertical-rl'
  const isMac = platform === 'darwin'
  const headingItems = [
    { id: 'h1', label: t('editor.heading.level1'), level: 1, icon: IconH1 },
    { id: 'h2', label: t('editor.heading.level2'), level: 2, icon: IconH2 },
    { id: 'h3', label: t('editor.heading.level3'), level: 3, icon: IconH3 },
    { id: 'h4', label: t('editor.heading.level4'), level: 4, icon: IconH4 },
    { id: 'h5', label: t('editor.heading.level5'), level: 5, icon: IconH5 },
    { id: 'h6', label: t('editor.heading.level6'), level: 6, icon: IconH6 },
  ] as const
  const listMenuItems = [
    {
      id: 'bullet',
      icon: IconList,
      label: t('editor.bulletList'),
      selected: availability.isBulletList,
      onSelect: onToggleBulletList,
    },
    {
      id: 'ordered',
      icon: IconListNumbers,
      label: t('editor.orderedList'),
      selected: availability.isOrderedList,
      onSelect: onToggleOrderedList,
    },
    {
      id: 'checklist',
      icon: IconSquareCheck,
      label: t('editor.checklist'),
      selected: availability.isChecklist,
      onSelect: onToggleChecklist,
    },
  ]
  const listMenuTriggerActive =
    availability.isBulletList || availability.isOrderedList || availability.isChecklist
  const blockDecorationToken = availability.blockDirectiveToken
  const blockDecorationActive = blockDecorationToken !== null
  const blockDecorationGroups: Array<
    Array<{ id: string; token: string; label: string; icon: typeof IconAlignCenter }>
  > = [
    [
      { id: 'center', token: 'align-center', label: t('editor.blockDecoration.center'), icon: IconAlignCenter },
      { id: 'end', token: 'align-end', label: t('editor.blockDecoration.end'), icon: IconAlignRight },
    ],
    [
      { id: 'indent1', token: 'indent-1', label: t('editor.blockDecoration.indent1'), icon: IconIndentIncrease },
      { id: 'indent2', token: 'indent-2', label: t('editor.blockDecoration.indent2'), icon: IconIndentIncrease },
      { id: 'indent3', token: 'indent-3', label: t('editor.blockDecoration.indent3'), icon: IconIndentIncrease },
      { id: 'indent4', token: 'indent-4', label: t('editor.blockDecoration.indent4'), icon: IconIndentIncrease },
      { id: 'indent5', token: 'indent-5', label: t('editor.blockDecoration.indent5'), icon: IconIndentIncrease },
      { id: 'indent6', token: 'indent-6', label: t('editor.blockDecoration.indent6'), icon: IconIndentIncrease },
    ],
    [
      { id: 'styleLetter', token: 'style-letter', label: t('editor.blockDecoration.styleLetter'), icon: IconLetterCase },
      { id: 'styleMuted', token: 'style-muted', label: t('editor.blockDecoration.styleMuted'), icon: IconLetterCase },
      { id: 'styleHeading', token: 'style-heading', label: t('editor.blockDecoration.styleHeading'), icon: IconLetterCase },
    ],
  ]
  // 空白ページ挿入の枚数プリセット。`nyozeBlankPage` の count 有効範囲 (1〜20) の
  // うち、よく使う枚数だけを選択肢として並べる (align/indent/style の token item
  // とは別の独立挿入 action のため、同じ blockDecorationGroups には混ぜない)。
  const blankPageCountOptions: Array<{ count: number; label: string }> = [
    { count: 1, label: t('editor.blockDecoration.blankPage') },
    { count: 2, label: t('editor.blockDecoration.blankPage2') },
    { count: 3, label: t('editor.blockDecoration.blankPage3') },
    { count: 4, label: t('editor.blockDecoration.blankPage4') },
    { count: 5, label: t('editor.blockDecoration.blankPage5') },
    { count: 10, label: t('editor.blockDecoration.blankPage10') },
    { count: 20, label: t('editor.blockDecoration.blankPage20') },
  ]
  const [headingMenuOpen, setHeadingMenuOpen] = useState(false)
  const [listMenuOpen, setListMenuOpen] = useState(false)
  const [blockDecorationMenuOpen, setBlockDecorationMenuOpen] = useState(false)
  const [shiftPressed, setShiftPressed] = useState(false)
  const headingMenuRef = useRef<HTMLDivElement | null>(null)
  const listMenuRef = useRef<HTMLDivElement | null>(null)
  const blockDecorationMenuRef = useRef<HTMLDivElement | null>(null)
  const headerRef = useRef<HTMLElement | null>(null)
  const leftZoneRef = useRef<HTMLDivElement | null>(null)
  const centerRef = useRef<HTMLDivElement | null>(null)
  const rightZoneRef = useRef<HTMLDivElement | null>(null)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const offsetRef = useRef(toolbarOffset)
  offsetRef.current = toolbarOffset
  // APP-HEADER-OVERFLOW-DRAG1: ResizeObserver の同一 snapshot から書かれる toolbar
  // viewport geometry。thumb 位置は常にこれと既存 `toolbarOffset` から導出し、
  // 第二の scroll position state は持たない。
  const [toolbarViewportMetrics, setToolbarViewportMetrics] =
    useState<ToolbarViewportMetrics | null>(null)
  const thumbDragRef = useRef<{ pointerId: number; grabOffset: number } | null>(null)
  // APP-HEADER-TOOLBAR-PAN-GRIP2: 専用 toolbar pan grip。window drag とは別要素で、
  // 開始時の clientX / offset / computeOffsetBounds() snapshot だけを使う。
  const toolbarPanRef = useRef<{
    pointerId: number
    startX: number
    startOffset: number
    bounds: { min: number; max: number }
  } | null>(null)
  const [toolbarPanning, setToolbarPanning] = useState(false)
  // APP-HEADER-OVERFLOW-DRAG1 native-fix: window drag region を toolbar より
  // 後ろの DOM 順で宣言するための overlay 位置（header 相対）。
  const gripSlotRef = useRef<HTMLSpanElement | null>(null)
  const appNameRef = useRef<HTMLSpanElement | null>(null)
  const [windowDragRegions, setWindowDragRegions] = useState<{
    grip: HeaderRect | null
    appName: HeaderRect | null
  }>({ grip: null, appName: null })
  const windowControlsReservedWidth = useWindowControlsOverlayReservation({
    headerRef,
    platform,
    usesNativeWindowControls,
  })
  const plainModeKind = resolvePlainModeKind({
    paragraphPlainModeActive,
    fullPlainEditActive,
  })
  const plainFormattingBlocked = plainModeKind !== null
  const plainFormattingTooltip = plainModeKind
    ? getPlainFormattingUnavailableMessage(plainModeKind)
    : ''

  useEffect(() => {
    const syncShiftState = (event: KeyboardEvent) => {
      setShiftPressed(event.shiftKey)
    }
    const resetShiftState = () => {
      setShiftPressed(false)
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        resetShiftState()
      }
    }

    window.addEventListener('keydown', syncShiftState)
    window.addEventListener('keyup', syncShiftState)
    window.addEventListener('blur', resetShiftState)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('keydown', syncShiftState)
      window.removeEventListener('keyup', syncShiftState)
      window.removeEventListener('blur', resetShiftState)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  // Compute min/max offset so the wrapper stays inside the real toolbar viewport.
  //
  // APP-HEADER-OVERFLOW-DRAG1 review-fix: 実際に toolbar を clip しているのは
  // `.unified-header-center` 自身（`clip-path: inset(-100vh 0 -100vh 0)`）である。
  // header の `gap: 4px` があるため、left/right zone の端から作った範囲は実 clip 領域より
  // 左右 4px ずつ、合計 8px 広い。その差で境界幅の overflow を取りこぼしていたので、
  // pan bounds も indicator geometry も centerRef の実 rect へ統一する。
  const computeOffsetBounds = useCallback(() => {
    const center = centerRef.current
    const wrapper = wrapperRef.current
    if (!center || !wrapper) return null
    const centerRect = center.getBoundingClientRect()
    const leftBound = centerRect.left
    const rightBound = centerRect.right
    const wrapperRect = wrapper.getBoundingClientRect()
    const cur = offsetRef.current
    const wrapperLeftAt0 = wrapperRect.left - cur
    const wrapperRightAt0 = wrapperRect.right - cur
    const rawMinOffset = leftBound - wrapperLeftAt0
    const rawMaxOffset = rightBound - wrapperRightAt0
    // When the toolbar is wider than the gap, rawMinOffset > rawMaxOffset. Clamp range must still
    // span panning from one alignment extreme to the other (swap so bounds.min <= bounds.max).
    if (rawMinOffset <= rawMaxOffset) {
      return { min: rawMinOffset, max: rawMaxOffset }
    }
    return { min: rawMaxOffset, max: rawMinOffset }
  }, [])

  /**
   * 既存の offset clamp。ResizeObserver の同一 snapshot で既に bounds を読んでいる
   * 場合はそれを渡し、同じ geometry を二度読まないようにする。
   */
  const clampToolbarOffset = useCallback(
    (snapshotBounds?: { min: number; max: number } | null) => {
      const bounds = snapshotBounds ?? computeOffsetBounds()
      if (!bounds) return
      const cur = offsetRef.current
      const clamped = clampOffsetToBounds(cur, bounds)
      if (clamped !== cur) onToolbarOffsetChange(clamped)
    },
    [computeOffsetBounds, onToolbarOffsetChange],
  )

  /**
   * 単一の geometry snapshot reader。ResizeObserver 同期と wheel 入口の両方がこれを使い、
   * overflow 判定・clamp・indicator geometry が同じ実 viewport（centerRef）を根拠にする。
   */
  const readToolbarViewportMetrics = useCallback((): ToolbarViewportMetrics | null => {
    const header = headerRef.current
    const center = centerRef.current
    const wrapper = wrapperRef.current
    const bounds = computeOffsetBounds()
    if (!header || !center || !wrapper || !bounds) return null
    const headerLeft = header.getBoundingClientRect().left
    const centerRect = center.getBoundingClientRect()
    return {
      trackLeft: centerRect.left - headerLeft,
      trackWidth: centerRect.width,
      contentWidth: wrapper.getBoundingClientRect().width,
      bounds,
    }
  }, [computeOffsetBounds])

  const syncToolbarGeometry = useCallback(() => {
    // 同じ snapshot で window drag overlay の位置も測る。toolbar の表示 / 非表示に
    // 関わらず必要なので、toolbar metrics より先に確定させる。
    const header = headerRef.current
    const headerRect = header ? header.getBoundingClientRect() : null
    const toHeaderRect = (element: Element | null): HeaderRect | null => {
      if (!element || !headerRect) return null
      const rect = element.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return null
      return {
        left: rect.left - headerRect.left,
        top: rect.top - headerRect.top,
        width: rect.width,
        height: rect.height,
      }
    }
    setWindowDragRegions((prev) => {
      const next = {
        grip: toHeaderRect(gripSlotRef.current),
        appName: toHeaderRect(appNameRef.current),
      }
      return headerRectsEqual(prev.grip, next.grip) &&
        headerRectsEqual(prev.appName, next.appName)
        ? prev
        : next
    })

    const metrics = readToolbarViewportMetrics()
    if (!metrics) {
      setToolbarViewportMetrics(null)
      return
    }
    clampToolbarOffset(metrics.bounds)
    setToolbarViewportMetrics(metrics)
  }, [clampToolbarOffset, readToolbarViewportMetrics])

  // Re-clamp offset on window / header resize
  useEffect(() => {
    const header = headerRef.current
    const leftZone = leftZoneRef.current
    const center = centerRef.current
    const rightZone = rightZoneRef.current
    const wrapper = wrapperRef.current
    if (!header) return
    const observer = new ResizeObserver(() => {
      syncToolbarGeometry()
    })
    observer.observe(header)
    if (leftZone) observer.observe(leftZone)
    if (center) observer.observe(center)
    if (rightZone) observer.observe(rightZone)
    if (wrapper) observer.observe(wrapper)

    // The center region animates width during collapse/expand; re-check on the next
    // frames so persisted offsets are clamped after layout settles.
    syncToolbarGeometry()
    let raf1 = 0
    let raf2 = 0
    raf1 = window.requestAnimationFrame(() => {
      syncToolbarGeometry()
      raf1 = 0
      raf2 = window.requestAnimationFrame(() => {
        syncToolbarGeometry()
        raf2 = 0
      })
    })
    return () => {
      observer.disconnect()
      if (raf1) window.cancelAnimationFrame(raf1)
      if (raf2) window.cancelAnimationFrame(raf2)
    }
  }, [syncToolbarGeometry, toolbarVisible, windowControlsReservedWidth])

  const handleToolbarCenterWheel: WheelEventHandler<HTMLDivElement> = useCallback(
    (event) => {
      if (!toolbarVisible || !wrapperRef.current) return
      // APP-HEADER-OVERFLOW-DRAG1 review-fix: bounds だけでは fit 状態でも左右へ寄せられて
      // しまう。同一 snapshot の実 overflow を必須にし、overflow していないときは
      // preventDefault も offset 変更も行わない。
      const metrics = readToolbarViewportMetrics()
      if (!isToolbarOverflowing(metrics)) return
      const bounds = (metrics as ToolbarViewportMetrics).bounds
      const dominant =
        Math.abs(event.deltaX) >= Math.abs(event.deltaY) ? event.deltaX : event.deltaY
      const cur = offsetRef.current
      const next = clampOffsetToBounds(cur + dominant, bounds)
      if (next !== cur) {
        event.preventDefault()
        onToolbarOffsetChange(next)
      }
    },
    [toolbarVisible, readToolbarViewportMetrics, onToolbarOffsetChange],
  )

  // thumb geometry は常に最新 snapshot と既存 `toolbarOffset` から導出する。
  // overflow していない / collapsed / snapshot 不正のときは null で描画しない。
  const toolbarScrollIndicator = useMemo(
    () =>
      computeToolbarScrollIndicator({
        metrics: toolbarViewportMetrics,
        offset: toolbarOffset,
      }),
    [toolbarViewportMetrics, toolbarOffset],
  )
  const toolbarScrollIndicatorRef = useRef(toolbarScrollIndicator)
  toolbarScrollIndicatorRef.current = toolbarScrollIndicator
  const toolbarViewportMetricsRef = useRef(toolbarViewportMetrics)
  toolbarViewportMetricsRef.current = toolbarViewportMetrics

  /**
   * thumb の pointer drag。`setPointerCapture()` による bounded な単一 gesture だけを
   * 使い、document へ解除不能な listener を残さない。timer / polling / synthetic
   * pointer replay も使わない。
   */
  const handleThumbPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    const indicator = toolbarScrollIndicatorRef.current
    if (!indicator) return
    const thumb = event.currentTarget
    event.preventDefault()
    event.stopPropagation()
    thumbDragRef.current = {
      pointerId: event.pointerId,
      grabOffset: event.clientX - thumb.getBoundingClientRect().left,
    }
    thumb.setPointerCapture(event.pointerId)
  }, [])

  const handleThumbPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = thumbDragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      const indicator = toolbarScrollIndicatorRef.current
      const metrics = toolbarViewportMetricsRef.current
      if (!indicator || !metrics) return
      const header = headerRef.current
      if (!header) return
      const next = resolveThumbDragOffset({
        pointerX: event.clientX,
        trackClientLeft: header.getBoundingClientRect().left + indicator.trackLeft,
        trackWidth: indicator.trackWidth,
        thumbWidth: indicator.thumbWidth,
        grabOffset: drag.grabOffset,
        bounds: metrics.bounds,
      })
      if (next !== offsetRef.current) onToolbarOffsetChange(next)
    },
    [onToolbarOffsetChange],
  )

  const handleThumbPointerEnd = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = thumbDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    thumbDragRef.current = null
    const thumb = event.currentTarget
    if (thumb.hasPointerCapture(event.pointerId)) thumb.releasePointerCapture(event.pointerId)
  }, [])

  /**
   * 専用 toolbar pan grip。primary pointer のみ。開始時の clientX / offset /
   * `computeOffsetBounds()` snapshot を使い、pointer capture で終端する。
   * timer / rAF を完了 authority にせず、window 座標も IPC も触らない。
   */
  const handleToolbarPanPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return
      if (event.detail === 2) {
        event.preventDefault()
        toolbarPanRef.current = null
        setToolbarPanning(false)
        onToolbarOffsetReset()
        return
      }
      const bounds = computeOffsetBounds()
      if (!bounds) return
      event.preventDefault()
      event.stopPropagation()
      toolbarPanRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startOffset: offsetRef.current,
        bounds,
      }
      setToolbarPanning(true)
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    [computeOffsetBounds, onToolbarOffsetReset],
  )

  const handleToolbarPanPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      const drag = toolbarPanRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      const next = resolveToolbarPanDragOffset({
        pointerX: event.clientX,
        startX: drag.startX,
        startOffset: drag.startOffset,
        bounds: drag.bounds,
      })
      if (next !== offsetRef.current) onToolbarOffsetChange(next)
    },
    [onToolbarOffsetChange],
  )

  const handleToolbarPanPointerEnd = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = toolbarPanRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    toolbarPanRef.current = null
    setToolbarPanning(false)
    const grip = event.currentTarget
    if (grip.hasPointerCapture(event.pointerId)) grip.releasePointerCapture(event.pointerId)
  }, [])

  // unmount / toolbar 非表示で pending gesture を必ず捨てる（capture は要素破棄で解放）。
  useEffect(() => {
    if (!toolbarVisible) setToolbarPanning(false)
    return () => {
      thumbDragRef.current = null
      toolbarPanRef.current = null
    }
  }, [toolbarVisible])

  useEffect(() => {
    if (!headingMenuOpen && !listMenuOpen && !blockDecorationMenuOpen) {
      return
    }

    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (headingMenuRef.current?.contains(target)) return
      if (listMenuRef.current?.contains(target)) return
      if (blockDecorationMenuRef.current?.contains(target)) return
      setHeadingMenuOpen(false)
      setListMenuOpen(false)
      setBlockDecorationMenuOpen(false)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setHeadingMenuOpen(false)
      setListMenuOpen(false)
      setBlockDecorationMenuOpen(false)
    }

    document.addEventListener('mousedown', onMouseDown, true)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('mousedown', onMouseDown, true)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [headingMenuOpen, listMenuOpen, blockDecorationMenuOpen])

  useEffect(() => {
    if (!plainFormattingBlocked) return
    setHeadingMenuOpen(false)
    setListMenuOpen(false)
    setBlockDecorationMenuOpen(false)
  }, [plainFormattingBlocked])

  const withPlainFormattingGuard = useCallback(
    (action: () => void) => () => {
      if (plainModeKind) {
        onShowEditorInlineHint(plainFormattingTooltip)
        setHeadingMenuOpen(false)
        setListMenuOpen(false)
        setBlockDecorationMenuOpen(false)
        return
      }
      action()
    },
    [onShowEditorInlineHint, plainFormattingTooltip, plainModeKind],
  )

  const getFormattingButtonProps = useCallback(
    (tooltip: string, baseDisabled: boolean) => {
      const state = resolveFormattingButtonState({
        plainModeKind,
        baseDisabled,
        defaultTooltip: tooltip,
      })
      return {
        disabled: state.disabled,
        'aria-disabled': state.ariaDisabled ? true : undefined,
        'data-tooltip': state.tooltip,
        title: state.title,
      }
    },
    [plainModeKind],
  )

  return (
    <header
      ref={headerRef}
      className={`unified-header${toolbarPanning ? ' is-toolbar-panning' : ''}`}
    >
      {/* ---- Left zone ---- */}
      <div ref={leftZoneRef} className='unified-header-left'>
        {/* Hamburger menu button: Win/Linux only */}
        {!isMac && (
          <button
            className='toolbar-btn-icon-only'
            onClick={onOpenAppMenu}
            type='button'
            data-tooltip={t('common.menu')}
            aria-label={t('common.menu')}
          >
            <IconMenu2 size={ICON_SIZE} stroke={ICON_STROKE} />
          </button>
        )}
        <button
          className={`pane-toggle has-tooltip${leftPaneOpen ? ' active' : ''}`}
          onClick={onToggleLeftPane}
          data-tooltip={leftPaneOpen ? t('header.closeLeftPane') : t('header.openLeftPane')}
          aria-label={leftPaneOpen ? t('header.closeLeftPane') : t('header.openLeftPane')}
          type='button'
        >
          {leftPaneOpen ? (
            <IconLayoutSidebarLeftCollapse size={ICON_SIZE} stroke={ICON_STROKE} />
          ) : (
            <IconLayoutSidebarLeftExpand size={ICON_SIZE} stroke={ICON_STROKE} />
          )}
        </button>
        {appTitleVisible && (
          <span ref={appNameRef} className='app-name'>
            {appTitleText}
          </span>
        )}
        <button
          className={`toolbar-collapse-toggle has-tooltip${toolbarVisible ? ' expanded' : ''}`}
          onClick={onToggleToolbarVisible}
          onDoubleClick={onToolbarOffsetReset}
          type='button'
          data-tooltip={toolbarVisible ? t('header.hideToolbar') : t('header.showToolbar')}
          aria-label={toolbarVisible ? t('header.hideToolbar') : t('header.showToolbar')}
          aria-expanded={toolbarVisible}
        >
          {toolbarVisible ? (
            <IconChevronLeft size={ICON_SIZE} stroke={ICON_STROKE} />
          ) : (
            <IconChevronRight size={ICON_SIZE} stroke={ICON_STROKE} />
          )}
        </button>
        <span className='unified-header-sep' aria-hidden='true' />
        {/* APP-HEADER-OVERFLOW-DRAG1: 固定 window drag grip の「場所取り」だけを
            通常フローで行う。実際の可視 grip と native draggable region は header 末尾の
            overlay 側にある（Electron は draggable region をリスト順に合成し、後勝ちで
            no-drag が drag を打ち消すため、overflow した toolbar button より後ろの
            DOM 順で宣言する必要がある）。 */}
        <span
          ref={gripSlotRef}
          className='header-window-drag-grip-slot'
          aria-hidden='true'
        />
      </div>

      {/* ---- Center: toolbar buttons ---- */}
      <div
        ref={centerRef}
        id={TOOLBAR_VIEWPORT_ID}
        className={`unified-header-center toolbar-btn-scope${toolbarVisible ? '' : ' collapsed'}`}
        onWheel={handleToolbarCenterWheel}
      >
        {toolbarVisible && (
          <div
            ref={wrapperRef}
            className='toolbar-drag-wrapper'
            style={{ transform: `translateX(${toolbarOffset}px)` }}
          >
            {/* APP-HEADER-TOOLBAR-PAN-GRIP2: 他の toolbar button と同じ列の左端。
                window drag overlay とは別要素で、native drag region にはしない。 */}
            <button
              type='button'
              className='toolbar-btn-icon-only header-toolbar-pan-grip has-tooltip'
              data-header-toolbar-pan-grip='true'
              data-tooltip={t('header.toolbarPanGrip', 'tooltip')}
              aria-label={t('header.toolbarPanGrip')}
              onPointerDown={handleToolbarPanPointerDown}
              onPointerMove={handleToolbarPanPointerMove}
              onPointerUp={handleToolbarPanPointerEnd}
              onPointerCancel={handleToolbarPanPointerEnd}
              onLostPointerCapture={handleToolbarPanPointerEnd}
              onDoubleClick={onToolbarOffsetReset}
            >
              <IconGripVertical size={ICON_SIZE} stroke={ICON_STROKE} />
            </button>
        <button
          className='toolbar-btn-icon-only'
          onClick={onLoad}
          type='button'
          data-toolbar-action='open-file'
          data-tooltip={shiftPressed ? t('common.newDocument') : t('common.openFile', 'tooltip')}
          aria-label={shiftPressed ? t('common.newDocument') : t('common.openFile')}
        >
          {shiftPressed ? (
            <IconFilePlus size={ICON_SIZE} stroke={ICON_STROKE} />
          ) : (
            <IconFolderOpen size={ICON_SIZE} stroke={ICON_STROKE} />
          )}
        </button>
        <button
          className='toolbar-btn-icon-only'
          onClick={onSave}
          disabled={internalDocActive}
          type='button'
          data-tooltip={shiftPressed ? t('common.saveAs') : t('common.save')}
          aria-label={shiftPressed ? t('common.saveAs') : t('common.save')}
        >
          {shiftPressed ? (
            <ShiftPlusIcon>
              <IconDeviceFloppy size={ICON_SIZE} stroke={ICON_STROKE} />
            </ShiftPlusIcon>
          ) : (
            <IconDeviceFloppy size={ICON_SIZE} stroke={ICON_STROKE} />
          )}
        </button>
        {/* 同一 Book 内の前後章ボタン（file 操作群に隣接）。logic は container 側。 */}
        {chapterNavSlot}
        <span className='toolbar-sep'>|</span>
        <button
          className='toolbar-btn-icon-only'
          onClick={onUndo}
          disabled={!availability.canUndo}
          type='button'
          data-tooltip={t('common.undo')}
          aria-label={t('common.undo')}
        >
          <IconArrowBackUp size={ICON_SIZE} stroke={ICON_STROKE} />
        </button>
        <button
          className='toolbar-btn-icon-only'
          onClick={onRedo}
          disabled={!availability.canRedo}
          type='button'
          data-tooltip={t('common.redo')}
          aria-label={t('common.redo')}
        >
          <IconArrowForwardUp size={ICON_SIZE} stroke={ICON_STROKE} />
        </button>
        <span className='toolbar-sep'>|</span>
        <button
          className={`toolbar-btn-icon-only${availability.isBold ? ' toggle-active' : ''}`}
          onClick={withPlainFormattingGuard(() => onRunMarkCommand('bold'))}
          type='button'
          tabIndex={-1}
          aria-label={t('editor.bold')}
          aria-pressed={availability.isBold}
          {...getFormattingButtonProps(t('editor.bold'), !availability.canBold)}
        >
          <IconBold size={ICON_SIZE} stroke={ICON_STROKE} />
        </button>
        <button
          className={`toolbar-btn-icon-only${availability.isItalic ? ' toggle-active' : ''}`}
          onClick={withPlainFormattingGuard(() => onRunMarkCommand('italic'))}
          type='button'
          tabIndex={-1}
          aria-label={t('editor.italic')}
          aria-pressed={availability.isItalic}
          {...getFormattingButtonProps(t('editor.italic'), !availability.canItalic)}
        >
          <IconItalic size={ICON_SIZE} stroke={ICON_STROKE} />
        </button>
        <button
          className={`toolbar-btn-icon-only${availability.isStrike ? ' toggle-active' : ''}`}
          onClick={withPlainFormattingGuard(() => onRunMarkCommand('strike'))}
          type='button'
          tabIndex={-1}
          aria-label={t('editor.strike')}
          aria-pressed={availability.isStrike}
          {...getFormattingButtonProps(t('editor.strike'), !availability.canStrike)}
        >
          <IconStrikethrough size={ICON_SIZE} stroke={ICON_STROKE} />
        </button>
        <button
          className={`toolbar-btn-icon-only${availability.isHighlight ? ' toggle-active' : ''}`}
          onClick={withPlainFormattingGuard(() => onRunMarkCommand('highlight'))}
          type='button'
          tabIndex={-1}
          aria-label={t('editor.highlight')}
          aria-pressed={availability.isHighlight}
          {...getFormattingButtonProps(t('editor.highlight'), !availability.canHighlight)}
        >
          <IconHighlight size={ICON_SIZE} stroke={ICON_STROKE} />
        </button>
        <button
          className={`toolbar-btn-icon-only${availability.isUnderline ? ' toggle-active' : ''}`}
          onClick={withPlainFormattingGuard(() => onRunMarkCommand('underline'))}
          type='button'
          tabIndex={-1}
          aria-label={t('editor.underline')}
          aria-pressed={availability.isUnderline}
          {...getFormattingButtonProps(t('editor.underline'), !availability.canUnderline)}
        >
          <IconUnderline size={ICON_SIZE} stroke={ICON_STROKE} />
        </button>
        <button
          className={`toolbar-btn-icon-only${availability.isInlineCode ? ' toggle-active' : ''}`}
          onClick={withPlainFormattingGuard(onToggleInlineCode)}
          type='button'
          tabIndex={-1}
          aria-label={t('editor.inlineCode')}
          aria-pressed={availability.isInlineCode}
          {...getFormattingButtonProps(t('editor.inlineCode'), !availability.canInlineCode)}
        >
          <IconCode size={ICON_SIZE} stroke={ICON_STROKE} />
        </button>
        <button
          className='toolbar-btn-icon-only'
          onClick={withPlainFormattingGuard(onClearFormat)}
          type='button'
          tabIndex={-1}
          aria-label={t('editor.clearFormat')}
          {...getFormattingButtonProps(t('editor.clearFormat'), !availability.canClearFormat)}
        >
          <IconEraser size={ICON_SIZE} stroke={ICON_STROKE} />
        </button>
        <span className='toolbar-sep'>|</span>
        <div className='toolbar-heading-menu-wrap' ref={headingMenuRef}>
          <button
            className={`toolbar-btn-icon-only toolbar-heading-trigger${headingMenuOpen ? ' open' : ''}`}
            onClick={withPlainFormattingGuard(() => {
              setHeadingMenuOpen((prev) => {
                const next = !prev
                if (next) setListMenuOpen(false)
                return next
              })
            })}
            type='button'
            tabIndex={-1}
            aria-label={t('editor.heading')}
            aria-haspopup='menu'
            aria-expanded={headingMenuOpen}
            {...getFormattingButtonProps(t('editor.heading'), !availability.canBlockTransforms)}
          >
            <IconHeading size={ICON_SIZE} stroke={ICON_STROKE} />
            <IconChevronDown size={12} stroke={ICON_STROKE} />
          </button>
          {headingMenuOpen && (
            <div className='toolbar-select-menu' role='menu' aria-label={t('editor.headingMenu')}>
              {headingItems.map((item) => {
                const Icon = item.icon
                const rowSelected = availability.isHeading === item.level
                return (
                  <button
                    key={item.id}
                    className={`toolbar-select-menu-item${rowSelected ? ' toolbar-select-menu-item--selected' : ''}`}
                    type='button'
                    role='menuitem'
                    disabled={plainFormattingBlocked}
                    onClick={withPlainFormattingGuard(() => {
                      onToggleHeading(item.level)
                      setHeadingMenuOpen(false)
                    })}
                  >
                    <Icon size={16} stroke={ICON_STROKE} />
                    <span className='toolbar-select-menu-label'>{item.label}</span>
                    <span className='toolbar-select-menu-check-slot' aria-hidden>
                      {rowSelected ? (
                        <IconCheck className='toolbar-select-menu-check' size={14} stroke={2} />
                      ) : null}
                    </span>
                  </button>
                )
              })}
              <div className='toolbar-heading-menu-separator' role='separator' />
              <button
                className={`toolbar-select-menu-item${availability.isHeading === false ? ' toolbar-select-menu-item--selected' : ''}`}
                type='button'
                role='menuitem'
                disabled={plainFormattingBlocked}
                onClick={withPlainFormattingGuard(() => {
                  onToggleHeading(0)
                  setHeadingMenuOpen(false)
                })}
              >
                <IconHeadingOff size={16} stroke={ICON_STROKE} />
                <span className='toolbar-select-menu-label'>{t('editor.heading.clear')}</span>
                <span className='toolbar-select-menu-check-slot' aria-hidden>
                  {availability.isHeading === false ? (
                    <IconCheck className='toolbar-select-menu-check' size={14} stroke={2} />
                  ) : null}
                </span>
              </button>
            </div>
          )}
        </div>
        <div className='toolbar-list-menu-wrap' ref={listMenuRef}>
          <button
            className={`toolbar-btn-icon-only toolbar-list-trigger${listMenuOpen ? ' open' : ''}${listMenuTriggerActive ? ' toggle-active' : ''}`}
            onClick={withPlainFormattingGuard(() => {
              setListMenuOpen((prev) => {
                const next = !prev
                if (next) setHeadingMenuOpen(false)
                return next
              })
            })}
            type='button'
            tabIndex={-1}
            aria-label={t('editor.listMenu')}
            aria-haspopup='menu'
            aria-expanded={listMenuOpen}
            {...getFormattingButtonProps(t('editor.listMenu'), !availability.canBlockTransforms)}
          >
            <IconListTree size={ICON_SIZE} stroke={ICON_STROKE} />
            <IconChevronDown size={12} stroke={ICON_STROKE} />
          </button>
          {listMenuOpen && (
            <div className='toolbar-select-menu' role='menu' aria-label={t('editor.listMenu')}>
              {listMenuItems.map((item) => {
                const Icon = item.icon
                return (
                  <button
                    key={item.id}
                    className={`toolbar-select-menu-item${item.selected ? ' toolbar-select-menu-item--selected' : ''}`}
                    type='button'
                    role='menuitem'
                    disabled={plainFormattingBlocked}
                    onClick={withPlainFormattingGuard(() => {
                      item.onSelect()
                      setListMenuOpen(false)
                    })}
                  >
                    <Icon size={16} stroke={ICON_STROKE} />
                    <span className='toolbar-select-menu-label'>{item.label}</span>
                    <span className='toolbar-select-menu-check-slot' aria-hidden>
                      {item.selected ? (
                        <IconCheck className='toolbar-select-menu-check' size={14} stroke={2} />
                      ) : null}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
        <button
          className={`toolbar-btn-icon-only${availability.isBlockquote ? ' toggle-active' : ''}`}
          onClick={withPlainFormattingGuard(onToggleBlockquote)}
          type='button'
          tabIndex={-1}
          aria-label={t('editor.blockquote')}
          {...getFormattingButtonProps(t('editor.blockquote'), !availability.canBlockTransforms)}
        >
          <IconBlockquote size={ICON_SIZE} stroke={ICON_STROKE} />
        </button>
        <button
          className={`toolbar-btn-icon-only${availability.isCodeBlock ? ' toggle-active' : ''}`}
          onClick={withPlainFormattingGuard(onToggleCodeBlock)}
          type='button'
          tabIndex={-1}
          aria-label={t('editor.codeBlock')}
          {...getFormattingButtonProps(t('editor.codeBlock'), !availability.canBlockTransforms)}
        >
          <IconCodeDots size={ICON_SIZE} stroke={ICON_STROKE} />
        </button>
        <div className='toolbar-block-decoration-menu-wrap' ref={blockDecorationMenuRef}>
          <button
            className={`toolbar-btn-icon-only toolbar-block-decoration-trigger${blockDecorationMenuOpen ? ' open' : ''}${blockDecorationActive ? ' toggle-active' : ''}`}
            onClick={withPlainFormattingGuard(() => {
              setBlockDecorationMenuOpen((prev) => {
                const next = !prev
                if (next) {
                  setHeadingMenuOpen(false)
                  setListMenuOpen(false)
                }
                return next
              })
            })}
            type='button'
            tabIndex={-1}
            aria-label={t('editor.blockDecoration')}
            aria-haspopup='menu'
            aria-expanded={blockDecorationMenuOpen}
            {...getFormattingButtonProps(t('editor.blockDecoration'), !availability.canBlockDirective)}
          >
            <IconLayoutDistributeHorizontal size={ICON_SIZE} stroke={ICON_STROKE} />
            <IconChevronDown size={12} stroke={ICON_STROKE} />
          </button>
          {blockDecorationMenuOpen && (
            <div
              className='toolbar-select-menu'
              role='menu'
              aria-label={t('editor.blockDecoration.menu')}
            >
              {blockDecorationGroups.map((group, groupIndex) => (
                <div key={`group-${groupIndex}`} className='toolbar-block-decoration-group'>
                  {groupIndex > 0 ? (
                    <div className='toolbar-heading-menu-separator' role='separator' />
                  ) : null}
                  {group.map((item) => {
                    const Icon = item.icon
                    const rowSelected = blockDecorationToken === item.token
                    return (
                      <button
                        key={item.id}
                        className={`toolbar-select-menu-item${rowSelected ? ' toolbar-select-menu-item--selected' : ''}`}
                        type='button'
                        role='menuitem'
                        data-directive-token={item.token}
                        disabled={plainFormattingBlocked}
                        onClick={withPlainFormattingGuard(() => {
                          onApplyBlockDirective(item.token)
                          setBlockDecorationMenuOpen(false)
                        })}
                      >
                        <Icon size={16} stroke={ICON_STROKE} />
                        <span className='toolbar-select-menu-label'>{item.label}</span>
                        <span className='toolbar-select-menu-check-slot' aria-hidden>
                          {rowSelected ? (
                            <IconCheck className='toolbar-select-menu-check' size={14} stroke={2} />
                          ) : null}
                        </span>
                      </button>
                    )
                  })}
                </div>
              ))}
              <div className='toolbar-heading-menu-separator' role='separator' />
              <button
                className='toolbar-select-menu-item'
                type='button'
                role='menuitem'
                data-directive-clear
                disabled={plainFormattingBlocked || !blockDecorationActive}
                onClick={withPlainFormattingGuard(() => {
                  onRemoveBlockDirective()
                  setBlockDecorationMenuOpen(false)
                })}
              >
                <IconSquareOff size={16} stroke={ICON_STROKE} />
                <span className='toolbar-select-menu-label'>
                  {t('editor.blockDecoration.clear')}
                </span>
                <span className='toolbar-select-menu-check-slot' aria-hidden />
              </button>
              <div className='toolbar-heading-menu-separator' role='separator' />
              <button
                className='toolbar-select-menu-item'
                type='button'
                role='menuitem'
                data-page-break-insert
                disabled={plainFormattingBlocked}
                onClick={withPlainFormattingGuard(() => {
                  onInsertPageBreak()
                  setBlockDecorationMenuOpen(false)
                })}
              >
                <IconPageBreak size={16} stroke={ICON_STROKE} />
                <span className='toolbar-select-menu-label'>
                  {t('editor.blockDecoration.pageBreak')}
                </span>
                <span className='toolbar-select-menu-check-slot' aria-hidden />
              </button>
              <button
                className='toolbar-select-menu-item'
                type='button'
                role='menuitem'
                data-page-break-delete
                disabled={plainFormattingBlocked || !availability.canDeletePageBreak}
                onClick={withPlainFormattingGuard(() => {
                  onDeletePageBreak()
                  setBlockDecorationMenuOpen(false)
                })}
              >
                <IconTrash size={16} stroke={ICON_STROKE} />
                <span className='toolbar-select-menu-label'>
                  {t('editor.blockDecoration.deletePageBreak')}
                </span>
                <span className='toolbar-select-menu-check-slot' aria-hidden />
              </button>
              {blankPageCountOptions.map((option) => (
                <button
                  key={`blank-page-${option.count}`}
                  className='toolbar-select-menu-item'
                  type='button'
                  role='menuitem'
                  data-blank-page-insert
                  data-blank-page-count={option.count}
                  disabled={plainFormattingBlocked}
                  onClick={withPlainFormattingGuard(() => {
                    onInsertBlankPage(option.count)
                    setBlockDecorationMenuOpen(false)
                  })}
                >
                  <IconFile size={16} stroke={ICON_STROKE} />
                  <span className='toolbar-select-menu-label'>{option.label}</span>
                  <span className='toolbar-select-menu-check-slot' aria-hidden />
                </button>
              ))}
            </div>
          )}
        </div>
        <span className='toolbar-sep'>|</span>
        <button
          className='toolbar-btn-icon-only'
          onClick={withPlainFormattingGuard(onSetOrUnsetLink)}
          type='button'
          tabIndex={-1}
          aria-label={t('editor.link')}
          {...getFormattingButtonProps(t('editor.link'), false)}
        >
          <IconLink size={ICON_SIZE} stroke={ICON_STROKE} />
        </button>
        <button
          className='toolbar-btn-icon-only'
          onClick={withPlainFormattingGuard(onInsertImage)}
          type='button'
          tabIndex={-1}
          aria-label={t('editor.image')}
          {...getFormattingButtonProps(t('editor.image'), false)}
        >
          <IconPhoto size={ICON_SIZE} stroke={ICON_STROKE} />
        </button>
        <button
          className='toolbar-btn-icon-only'
          onClick={withPlainFormattingGuard(onInsertRubyBouten)}
          type='button'
          tabIndex={-1}
          aria-label={t('editor.insertRuby')}
          {...getFormattingButtonProps(t('editor.insertRuby'), !availability.canInsertRuby)}
        >
          <IconDiamond size={ICON_SIZE} stroke={ICON_STROKE} />
        </button>
        <button
          className='toolbar-btn-icon-only'
          onClick={withPlainFormattingGuard(onToggleTcy)}
          type='button'
          tabIndex={-1}
          aria-label={t('editor.tcy')}
          {...getFormattingButtonProps(t('editor.tcy'), !availability.canToggleTcy)}
        >
          <IconNumber123 size={ICON_SIZE} stroke={ICON_STROKE} />
        </button>
        <button
          className='toolbar-btn-icon-only'
          onClick={withPlainFormattingGuard(onAddNoteAnchor)}
          type='button'
          tabIndex={-1}
          aria-label={t('editor.noteAnchor')}
          {...getFormattingButtonProps(t('editor.noteAnchor'), false)}
        >
          <IconNote size={ICON_SIZE} stroke={ICON_STROKE} />
        </button>
        <span className='toolbar-sep'>|</span>
        <button
          className='toolbar-btn-icon-only'
          onClick={withPlainFormattingGuard(onInsertHorizontalRule)}
          type='button'
          tabIndex={-1}
          aria-label={t('editor.horizontalRule')}
          {...getFormattingButtonProps(t('editor.horizontalRule'), !availability.canBlockTransforms)}
        >
          {isVertical ? (
            <IconSeparatorVertical size={ICON_SIZE} stroke={ICON_STROKE} />
          ) : (
            <IconSeparatorHorizontal size={ICON_SIZE} stroke={ICON_STROKE} />
          )}
        </button>
          </div>
        )}
      </div>

      {/* ---- Right zone ---- */}
      <div ref={rightZoneRef} className='unified-header-right'>
        <button
          className={`pane-toggle has-tooltip${rightPaneOpen ? ' active' : ''}`}
          onClick={onToggleRightPane}
          data-tooltip={rightPaneOpen ? t('header.closeRightPane') : t('header.openRightPane')}
          aria-label={rightPaneOpen ? t('header.closeRightPane') : t('header.openRightPane')}
          type='button'
        >
          {rightPaneOpen ? (
            <IconLayoutSidebarRightCollapse size={ICON_SIZE} stroke={ICON_STROKE} />
          ) : (
            <IconLayoutSidebarRightExpand size={ICON_SIZE} stroke={ICON_STROKE} />
          )}
        </button>
        {!usesNativeWindowControls && (
          <div className='window-controls'>
            <button
              className='window-control-btn has-tooltip'
              type='button'
              data-tooltip={t('common.minimize')}
              aria-label={t('common.minimize')}
              onClick={onWindowMinimize}
            >
              <IconMinus size={12} stroke={1.7} />
            </button>
            <button
              className='window-control-btn window-control-btn-close has-tooltip'
              type='button'
              data-tooltip={t('common.close')}
              aria-label={t('common.close')}
              onClick={onWindowClose}
            >
              <IconX size={11} stroke={1.7} />
            </button>
          </div>
        )}
      </div>

      {/* APP-HEADER-OVERFLOW-DRAG1: toolbar が viewport より広いときだけ現れる薄い
          scroll indicator。header 内側の下端へ絶対配置するので 36px の header 高は
          変わらず、header / tab strip / 本文を押し下げない。track は left / right fixed
          zone の間だけなので native window controls とも重ならない。 */}
      {toolbarScrollIndicator && (
        <div
          className='toolbar-scroll-indicator'
          data-toolbar-scroll-indicator='true'
          style={{
            left: `${toolbarScrollIndicator.trackLeft}px`,
            width: `${toolbarScrollIndicator.trackWidth}px`,
          }}
        >
          <div
            className='toolbar-scroll-thumb'
            data-toolbar-scroll-thumb='true'
            style={{
              width: `${toolbarScrollIndicator.thumbWidth}px`,
              transform: `translateX(${toolbarScrollIndicator.thumbLeft}px)`,
            }}
            role='scrollbar'
            aria-orientation='horizontal'
            aria-controls={TOOLBAR_VIEWPORT_ID}
            aria-label={t('header.toolbarScroll')}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(toolbarScrollIndicator.progress * 100)}
            onPointerDown={handleThumbPointerDown}
            onPointerMove={handleThumbPointerMove}
            onPointerUp={handleThumbPointerEnd}
            onPointerCancel={handleThumbPointerEnd}
            onLostPointerCapture={handleThumbPointerEnd}
            onDoubleClick={onToolbarOffsetReset}
          />
        </div>
      )}

      {/* APP-HEADER-OVERFLOW-DRAG1 native-fix: window drag region は toolbar より
          後ろの DOM 順で宣言する。Electron は draggable region を順に union / difference
          するので、overflow した toolbar button の no-drag 矩形が left fixed zone の上へ
          広がっても、あとから来るこの drag 宣言が勝つ。位置は通常フローの場所取り要素
          （grip slot / app-name）を同一 snapshot で測って合わせるだけで、renderer から
          window 座標を操作したり新しい IPC を足したりはしない。 */}
      {windowDragRegions.grip && (
        <span
          className='header-window-drag-grip'
          data-header-window-drag-grip='true'
          style={headerRectStyle(windowDragRegions.grip)}
          title={t('header.windowDragGrip')}
          aria-hidden='true'
        >
          <IconGripHorizontal />
        </span>
      )}
      {windowDragRegions.appName && (
        <span
          className='header-window-drag-overlay'
          data-header-window-drag-overlay='app-name'
          style={headerRectStyle(windowDragRegions.appName)}
          aria-hidden='true'
        />
      )}
    </header>
  )
}
