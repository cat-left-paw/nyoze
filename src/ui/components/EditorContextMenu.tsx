import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { CommandAvailability, SelectionRange } from '../../editor-core/types'
import type { UiLanguageMode, WritingMode } from '../../settings/types'
import {
  IconAlignCenter,
  IconAlignRight,
  IconArrowDown,
  IconArrowBackUp,
  IconArrowForwardUp,
  IconArrowUp,
  IconBold,
  IconSquareCheck,
  IconClipboard,
  IconClipboardText,
  IconCopy,
  IconDiamond,
  IconEraser,
  IconFile,
  IconH1,
  IconH2,
  IconH3,
  IconH4,
  IconH5,
  IconH6,
  IconHeading,
  IconHeadingOff,
  IconHighlight,
  IconIndentIncrease,
  IconItalic,
  IconLayoutDistributeHorizontal,
  IconLetterCase,
  IconList,
  IconListNumbers,
  IconPageBreak,
  IconScissors,
  IconSelectAll,
  IconSquareOff,
  IconStrikethrough,
  IconTrash,
  IconUnderline,
  IconNumber123,
} from '@tabler/icons-react'
import { createUiTextGetter } from '../i18n/uiText'
import { buildAddNoteContextMenuItem } from './noteAnchorAddContextMenuItem'
import { buildNoteAnchorContextMenuItems } from './noteAnchorContextMenuItems'
import type { NoteAnchorDeletePath } from '../utils/noteAnchorDeletePath'

const ICON_SIZE = 16
const ICON_STROKE = 1.2

type MenuAction = () => void | Promise<void>

type MenuItem = {
  id: string
  label: string
  icon: React.ReactNode
  disabled: boolean
  active?: boolean
  action?: MenuAction
  submenu?: MenuEntry[]
  separator?: false
  shortcut?: string
  /** テスト / e2e 用の追加 data-* 属性 (例: directive token / page-break action の識別)。 */
  dataAttrs?: Record<string, string>
}
type SeparatorItem = { separator: true; id: string }
type MenuEntry = MenuItem | SeparatorItem

type EditorContextMenuProps = {
  visible: boolean
  x: number
  y: number
  availability: CommandAvailability
  writingMode: WritingMode
  uiLanguageMode: UiLanguageMode
  menuRef: RefObject<HTMLDivElement | null>
  onUndo: () => void
  onRedo: () => void
  onCut: () => void
  onCopy: () => void
  onPaste: () => void | Promise<void>
  onPastePlain: () => void | Promise<void>
  onSelectAll: () => void
  onBold: () => void
  onItalic: () => void
  onStrike: () => void
  onHighlight: () => void
  onUnderline: () => void
  onHeading: (level: number) => void
  onBulletList: () => void
  onOrderedList: () => void
  onChecklist: () => void
  onRuby: () => void
  onTcy: () => void
  onClearFormat: () => void
  onMoveListUp: () => void
  onMoveListDown: () => void
  /** 独自ブロック装飾 (align-center / indent-3 / style-letter 等) を適用 / 置換する。 */
  onApplyBlockDirective: (token: string) => void
  /** 独自ブロック装飾を解除する。 */
  onRemoveBlockDirective: () => void
  /** 改ページ marker (`nyozePageBreak`) を挿入する。 */
  onInsertPageBreak: () => void
  /** selection が改ページ marker のときだけ有効な削除 action。 */
  onDeletePageBreak: () => void
  /** 空白ページ marker (`nyozeBlankPage`) を挿入する。count は 1〜20 (省略時 1)。 */
  onInsertBlankPage: (count?: number) => void
  noteAnchorContextId?: string | null
  noteAnchorMarkerDeleteMode?: NoteAnchorDeletePath | null
  onShowNoteInPanel?: (id: string) => void
  onDeleteNoteAnchor?: (id: string) => void
  showAddNoteAnchor?: boolean
  contextMenuSelectionRange?: SelectionRange | null
  onOpenNoteAnchorPrompt?: (range?: SelectionRange) => void | Promise<void>
  onClose: () => void
}

export function EditorContextMenu({
  visible,
  x,
  y,
  availability,
  writingMode,
  uiLanguageMode,
  menuRef,
  onUndo,
  onRedo,
  onCut,
  onCopy,
  onPaste,
  onPastePlain,
  onSelectAll,
  onBold,
  onItalic,
  onStrike,
  onHighlight,
  onUnderline,
  onHeading,
  onBulletList,
  onOrderedList,
  onChecklist,
  onRuby,
  onTcy,
  onClearFormat,
  onMoveListUp,
  onMoveListDown,
  onApplyBlockDirective,
  onRemoveBlockDirective,
  onInsertPageBreak,
  onDeletePageBreak,
  onInsertBlankPage,
  noteAnchorContextId = null,
  noteAnchorMarkerDeleteMode = null,
  onShowNoteInPanel,
  onDeleteNoteAnchor,
  showAddNoteAnchor = false,
  contextMenuSelectionRange = null,
  onOpenNoteAnchorPrompt,
  onClose,
}: EditorContextMenuProps) {
  const t = createUiTextGetter(uiLanguageMode)
  const localRef = useRef<HTMLDivElement | null>(null)
  const [submenuDirection, setSubmenuDirection] = useState<'right' | 'left'>('right')

  const setRef = useCallback(
    (el: HTMLDivElement | null) => {
      localRef.current = el
      ;(menuRef as React.MutableRefObject<HTMLDivElement | null>).current = el
    },
    [menuRef],
  )

  useEffect(() => {
    if (!visible) return
    const el = localRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    let left = x
    let top = y
    if (left + rect.width > vw) left = vw - rect.width - 4
    if (top + rect.height > vh) top = vh - rect.height - 4
    if (left < 0) left = 4
    if (top < 0) top = 4
    el.style.left = `${left}px`
    el.style.top = `${top}px`

    const SUBMENU_ESTIMATED_WIDTH = 232
    const shouldOpenLeft = left + rect.width + SUBMENU_ESTIMATED_WIDTH > vw - 4
    setSubmenuDirection(shouldOpenLeft ? 'left' : 'right')
  }, [visible, x, y])

  /**
   * submenu (例: ブロック装飾) はトリガー行の高さでウィンドウ下端をはみ出す
   * ことがある (項目数が多い submenu ほど起こりやすい)。CSS の `:hover` 表示は
   * 開閉状態を React state に持たないため、実際に表示された直後の
   * `getBoundingClientRect()` を使って毎回はみ出しを判定し、はみ出す場合だけ
   * 上端ではなく下端をトリガー行に揃えて上向きに開く (`bottom` アンカー) よう
   * インライン style を直接設定する。毎回リセットしてから再計測するため、
   * ウィンドウサイズ変更や別行への再ホバーでも古い値を引きずらない。
   */
  const handleSubmenuTriggerMouseEnter = useCallback(
    (event: React.MouseEvent<HTMLDivElement> | React.FocusEvent<HTMLDivElement>) => {
      const trigger = event.currentTarget
      const submenu = trigger.querySelector<HTMLDivElement>('.editor-context-submenu')
      if (!submenu) return
      submenu.style.top = ''
      submenu.style.bottom = ''
      submenu.style.maxHeight = ''

      const MARGIN = 8
      const rect = submenu.getBoundingClientRect()
      const vh = window.innerHeight
      if (rect.bottom <= vh - MARGIN) return

      const triggerRect = trigger.getBoundingClientRect()
      submenu.style.top = 'auto'
      submenu.style.bottom = '-4px'
      submenu.style.maxHeight = `${Math.max(120, triggerRect.bottom - MARGIN)}px`
      submenu.style.overflowY = 'auto'
    },
    [],
  )

  if (!visible) return null

  const a = availability
  const isMac = navigator.platform.toLowerCase().includes('mac')
  const mod = isMac ? '⌘' : 'Ctrl'
  const selectAllShortcut = `${mod}+A`
  const headingResetShortcut = `${mod}+Alt+0`
  const listMoveUpShortcut = writingMode === 'horizontal-tb' ? `${mod}+↑` : `${mod}+→`
  const listMoveDownShortcut = writingMode === 'horizontal-tb' ? `${mod}+↓` : `${mod}+←`

  const wrap = (action: MenuAction) => () => {
    void Promise.resolve(action()).finally(onClose)
  }

  const headingEntries: MenuItem[] = [
    {
      id: 'h1',
      label: t('editor.heading.level1'),
      icon: <IconH1 size={ICON_SIZE} stroke={ICON_STROKE} />,
      disabled: !a.canBlockTransforms,
      active: a.isHeading === 1,
      action: wrap(() => onHeading(1)),
      shortcut: `${mod}+Alt+1`,
    },
    {
      id: 'h2',
      label: t('editor.heading.level2'),
      icon: <IconH2 size={ICON_SIZE} stroke={ICON_STROKE} />,
      disabled: !a.canBlockTransforms,
      active: a.isHeading === 2,
      action: wrap(() => onHeading(2)),
      shortcut: `${mod}+Alt+2`,
    },
    {
      id: 'h3',
      label: t('editor.heading.level3'),
      icon: <IconH3 size={ICON_SIZE} stroke={ICON_STROKE} />,
      disabled: !a.canBlockTransforms,
      active: a.isHeading === 3,
      action: wrap(() => onHeading(3)),
      shortcut: `${mod}+Alt+3`,
    },
    {
      id: 'h4',
      label: t('editor.heading.level4'),
      icon: <IconH4 size={ICON_SIZE} stroke={ICON_STROKE} />,
      disabled: !a.canBlockTransforms,
      active: a.isHeading === 4,
      action: wrap(() => onHeading(4)),
      shortcut: `${mod}+Alt+4`,
    },
    {
      id: 'h5',
      label: t('editor.heading.level5'),
      icon: <IconH5 size={ICON_SIZE} stroke={ICON_STROKE} />,
      disabled: !a.canBlockTransforms,
      active: a.isHeading === 5,
      action: wrap(() => onHeading(5)),
      shortcut: `${mod}+Alt+5`,
    },
    {
      id: 'h6',
      label: t('editor.heading.level6'),
      icon: <IconH6 size={ICON_SIZE} stroke={ICON_STROKE} />,
      disabled: !a.canBlockTransforms,
      active: a.isHeading === 6,
      action: wrap(() => onHeading(6)),
      shortcut: `${mod}+Alt+6`,
    },
    {
      id: 'paragraph',
      label: t('editor.heading.clear'),
      icon: <IconHeadingOff size={ICON_SIZE} stroke={ICON_STROKE} />,
      disabled: a.isHeading === false || !a.canBlockTransforms,
      action: wrap(() => onHeading(0)),
      shortcut: headingResetShortcut,
    },
  ]

  // 独自ブロック装飾 (align / indent / style) は既存 toolbar のブロック装飾メニューと
  // 同じ token / command / availability を使う。page-break の挿入・削除は
  // `nyozeDirectiveBlock` の apply/remove とは別の独立 action のため、
  // token 系 item とは data attr (`data-directive-token` 等) で区別する。
  const directiveTokenGroups: Array<
    Array<{ id: string; token: string; label: string; icon: typeof IconAlignCenter }>
  > = [
    [
      { id: 'ctx-align-center', token: 'align-center', label: t('editor.blockDecoration.center'), icon: IconAlignCenter },
      { id: 'ctx-align-end', token: 'align-end', label: t('editor.blockDecoration.end'), icon: IconAlignRight },
    ],
    [
      { id: 'ctx-indent1', token: 'indent-1', label: t('editor.blockDecoration.indent1'), icon: IconIndentIncrease },
      { id: 'ctx-indent2', token: 'indent-2', label: t('editor.blockDecoration.indent2'), icon: IconIndentIncrease },
      { id: 'ctx-indent3', token: 'indent-3', label: t('editor.blockDecoration.indent3'), icon: IconIndentIncrease },
      { id: 'ctx-indent4', token: 'indent-4', label: t('editor.blockDecoration.indent4'), icon: IconIndentIncrease },
      { id: 'ctx-indent5', token: 'indent-5', label: t('editor.blockDecoration.indent5'), icon: IconIndentIncrease },
      { id: 'ctx-indent6', token: 'indent-6', label: t('editor.blockDecoration.indent6'), icon: IconIndentIncrease },
    ],
    [
      { id: 'ctx-styleLetter', token: 'style-letter', label: t('editor.blockDecoration.styleLetter'), icon: IconLetterCase },
      { id: 'ctx-styleMuted', token: 'style-muted', label: t('editor.blockDecoration.styleMuted'), icon: IconLetterCase },
      { id: 'ctx-styleHeading', token: 'style-heading', label: t('editor.blockDecoration.styleHeading'), icon: IconLetterCase },
    ],
  ]

  // 空白ページ挿入の枚数プリセット。toolbar 側 (`UnifiedHeader.tsx`) と同じ
  // 選択肢。`nyozeBlankPage` の count 有効範囲 (1〜20) のうち、よく使う枚数
  // だけを選択肢として並べる (align/indent/style の token item とは別の独立
  // 挿入 action のため、directiveTokenGroups には混ぜない)。
  const blankPageCountOptions: Array<{ count: number; label: string }> = [
    { count: 1, label: t('editor.blockDecoration.blankPage') },
    { count: 2, label: t('editor.blockDecoration.blankPage2') },
    { count: 3, label: t('editor.blockDecoration.blankPage3') },
    { count: 4, label: t('editor.blockDecoration.blankPage4') },
    { count: 5, label: t('editor.blockDecoration.blankPage5') },
    { count: 10, label: t('editor.blockDecoration.blankPage10') },
    { count: 20, label: t('editor.blockDecoration.blankPage20') },
  ]

  const blockDecorationEntries: MenuEntry[] = [
    ...directiveTokenGroups.flatMap((group, groupIndex): MenuEntry[] => [
      ...(groupIndex > 0 ? [{ separator: true, id: `ctx-directive-sep-${groupIndex}` } as SeparatorItem] : []),
      ...group.map((item): MenuItem => ({
        id: item.id,
        label: item.label,
        icon: <item.icon size={ICON_SIZE} stroke={ICON_STROKE} />,
        disabled: !a.canBlockDirective,
        active: a.blockDirectiveToken === item.token,
        action: wrap(() => onApplyBlockDirective(item.token)),
        dataAttrs: { 'data-directive-token': item.token },
      })),
    ]),
    { separator: true, id: 'ctx-directive-sep-clear' },
    {
      id: 'ctx-directive-clear',
      label: t('editor.blockDecoration.clear'),
      icon: <IconSquareOff size={ICON_SIZE} stroke={ICON_STROKE} />,
      disabled: !a.canBlockDirective || a.blockDirectiveToken === null,
      action: wrap(onRemoveBlockDirective),
      dataAttrs: { 'data-directive-clear': '' },
    },
    { separator: true, id: 'ctx-directive-sep-pagebreak' },
    {
      id: 'ctx-page-break-insert',
      label: t('editor.blockDecoration.pageBreak'),
      icon: <IconPageBreak size={ICON_SIZE} stroke={ICON_STROKE} />,
      disabled: !a.canBlockDirective,
      action: wrap(onInsertPageBreak),
      dataAttrs: { 'data-page-break-insert': '' },
    },
    {
      id: 'ctx-page-break-delete',
      label: t('editor.blockDecoration.deletePageBreak'),
      icon: <IconTrash size={ICON_SIZE} stroke={ICON_STROKE} />,
      disabled: !a.canDeletePageBreak,
      action: wrap(onDeletePageBreak),
      dataAttrs: { 'data-page-break-delete': '' },
    },
    ...blankPageCountOptions.map((option): MenuItem => ({
      id: `ctx-blank-page-insert-${option.count}`,
      label: option.label,
      icon: <IconFile size={ICON_SIZE} stroke={ICON_STROKE} />,
      disabled: !a.canBlockDirective,
      action: wrap(() => onInsertBlankPage(option.count)),
      dataAttrs: { 'data-blank-page-insert': '', 'data-blank-page-count': String(option.count) },
    })),
  ]

  const resolvedNoteAnchorContextId = noteAnchorContextId

  const noteAnchorEntries: MenuEntry[] =
    resolvedNoteAnchorContextId && onShowNoteInPanel && onDeleteNoteAnchor
      ? buildNoteAnchorContextMenuItems({
          availability: a,
          noteAnchorContextId: resolvedNoteAnchorContextId,
          markerDeleteMode: noteAnchorMarkerDeleteMode,
          uiLanguageMode,
          onShowNoteInPanel,
          onDeleteNoteAnchor,
        }).map((entry) =>
          entry.separator
            ? entry
            : {
                ...entry,
                action: entry.action ? wrap(entry.action) : undefined,
              },
        )
      : []

  const addNoteEntries: MenuEntry[] =
    showAddNoteAnchor && onOpenNoteAnchorPrompt
      ? [
          { separator: true, id: 'sep-note' },
          {
            ...buildAddNoteContextMenuItem({
              uiLanguageMode,
              onAddNote: () =>
                onOpenNoteAnchorPrompt(contextMenuSelectionRange ?? undefined),
            }),
            action: wrap(() =>
              onOpenNoteAnchorPrompt(contextMenuSelectionRange ?? undefined),
            ),
          },
        ]
      : []

  const standardEntries: MenuEntry[] = [
    {
      id: 'undo',
      label: t('common.undo'),
      icon: <IconArrowBackUp size={ICON_SIZE} stroke={ICON_STROKE} />,
      disabled: !a.canUndo,
      action: wrap(onUndo),
      shortcut: `${mod}+Z`,
    },
    {
      id: 'redo',
      label: t('common.redo'),
      icon: <IconArrowForwardUp size={ICON_SIZE} stroke={ICON_STROKE} />,
      disabled: !a.canRedo,
      action: wrap(onRedo),
      shortcut: `${mod}+Shift+Z`,
    },
    { separator: true, id: 'sep-edit-history' },
    {
      id: 'cut',
      label: t('common.cut'),
      icon: <IconScissors size={ICON_SIZE} stroke={ICON_STROKE} />,
      disabled: !a.canCut,
      action: wrap(onCut),
      shortcut: `${mod}+X`,
    },
    {
      id: 'copy',
      label: t('common.copy'),
      icon: <IconCopy size={ICON_SIZE} stroke={ICON_STROKE} />,
      disabled: !a.canCopy,
      action: wrap(onCopy),
      shortcut: `${mod}+C`,
    },
    {
      id: 'paste',
      label: t('common.paste'),
      icon: <IconClipboard size={ICON_SIZE} stroke={ICON_STROKE} />,
      disabled: !a.canPaste,
      action: wrap(onPaste),
      shortcut: `${mod}+V`,
    },
    {
      id: 'pastePlain',
      label: t('editor.pastePlain'),
      icon: <IconClipboardText size={ICON_SIZE} stroke={ICON_STROKE} />,
      disabled: !a.canPaste,
      action: wrap(onPastePlain),
    },
    {
      id: 'selectAll',
      label: t('common.selectAll'),
      icon: <IconSelectAll size={ICON_SIZE} stroke={ICON_STROKE} />,
      disabled: !a.canSelectAll,
      action: wrap(onSelectAll),
      shortcut: selectAllShortcut,
    },
    { separator: true, id: 'sep-clipboard' },
    ...addNoteEntries,
    {
      id: 'bold',
      label: t('editor.bold'),
      icon: <IconBold size={ICON_SIZE} stroke={ICON_STROKE} />,
      disabled: !a.canBold,
      active: a.isBold,
      action: wrap(onBold),
      shortcut: `${mod}+B`,
    },
    {
      id: 'italic',
      label: t('editor.italic'),
      icon: <IconItalic size={ICON_SIZE} stroke={ICON_STROKE} />,
      disabled: !a.canItalic,
      active: a.isItalic,
      action: wrap(onItalic),
      shortcut: `${mod}+I`,
    },
    {
      id: 'strike',
      label: t('editor.strike'),
      icon: <IconStrikethrough size={ICON_SIZE} stroke={ICON_STROKE} />,
      disabled: !a.canStrike,
      active: a.isStrike,
      action: wrap(onStrike),
      shortcut: `${mod}+Shift+X`,
    },
    {
      id: 'highlight',
      label: t('editor.highlight'),
      icon: <IconHighlight size={ICON_SIZE} stroke={ICON_STROKE} />,
      disabled: !a.canHighlight,
      active: a.isHighlight,
      action: wrap(onHighlight),
    },
    {
      id: 'underline',
      label: t('editor.underline'),
      icon: <IconUnderline size={ICON_SIZE} stroke={ICON_STROKE} />,
      disabled: !a.canUnderline,
      active: a.isUnderline,
      action: wrap(onUnderline),
    },
    { separator: true, id: 'sep-format' },
    {
      id: 'heading-submenu',
      label: t('editor.heading'),
      icon: <IconHeading size={ICON_SIZE} stroke={ICON_STROKE} />,
      disabled: !a.canBlockTransforms,
      submenu: headingEntries,
    },
    {
      id: 'block-decoration-submenu',
      label: t('editor.blockDecoration'),
      icon: <IconLayoutDistributeHorizontal size={ICON_SIZE} stroke={ICON_STROKE} />,
      disabled: !a.canBlockDirective,
      submenu: blockDecorationEntries,
    },
    {
      id: 'bulletList',
      label: t('editor.bulletList'),
      icon: <IconList size={ICON_SIZE} stroke={ICON_STROKE} />,
      disabled: !a.canBlockTransforms,
      active: a.isBulletList,
      action: wrap(onBulletList),
    },
    {
      id: 'orderedList',
      label: t('editor.orderedList'),
      icon: <IconListNumbers size={ICON_SIZE} stroke={ICON_STROKE} />,
      disabled: !a.canBlockTransforms,
      active: a.isOrderedList,
      action: wrap(onOrderedList),
    },
    {
      id: 'checklist',
      label: t('editor.checklist'),
      icon: <IconSquareCheck size={ICON_SIZE} stroke={ICON_STROKE} />,
      disabled: !a.canBlockTransforms,
      active: a.isChecklist,
      action: wrap(onChecklist),
    },
    {
      id: 'moveUp',
      label: t('editor.moveListItemUp'),
      icon: <IconArrowUp size={ICON_SIZE} stroke={ICON_STROKE} />,
      disabled: !a.canMoveListUp,
      action: wrap(onMoveListUp),
      shortcut: listMoveUpShortcut,
    },
    {
      id: 'moveDown',
      label: t('editor.moveListItemDown'),
      icon: <IconArrowDown size={ICON_SIZE} stroke={ICON_STROKE} />,
      disabled: !a.canMoveListDown,
      action: wrap(onMoveListDown),
      shortcut: listMoveDownShortcut,
    },
    { separator: true, id: 'sep-extra' },
    {
      id: 'ruby',
      label: t('editor.insertRuby'),
      icon: <IconDiamond size={ICON_SIZE} stroke={ICON_STROKE} />,
      disabled: !a.canInsertRuby,
      action: wrap(onRuby),
    },
    {
      id: 'tcy',
      label: t('editor.tcy'),
      icon: <IconNumber123 size={ICON_SIZE} stroke={ICON_STROKE} />,
      disabled: !a.canToggleTcy,
      action: wrap(onTcy),
    },
    {
      id: 'clearFormat',
      label: t('editor.clearFormat'),
      icon: <IconEraser size={ICON_SIZE} stroke={ICON_STROKE} />,
      disabled: !a.canClearFormat,
      action: wrap(onClearFormat),
      shortcut: `${mod}+Shift+C`,
    },
  ]

  const entries: MenuEntry[] =
    noteAnchorEntries.length > 0 ? noteAnchorEntries : standardEntries

  return (
    <div
      ref={setRef}
      className={`editor-context-menu${submenuDirection === 'left' ? ' submenu-left' : ''}`}
      style={{ left: x, top: y }}
      role='menu'
    >
      {entries.map((entry) =>
        entry.separator ? (
          <div key={entry.id} className='editor-context-menu-separator' role='separator' />
        ) : entry.submenu ? (
          <div
            key={entry.id}
            className={`editor-context-menu-item has-submenu${entry.active ? ' active' : ''}${entry.disabled ? ' disabled' : ''}`}
            role='menuitem'
            aria-haspopup='menu'
            tabIndex={0}
            onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={handleSubmenuTriggerMouseEnter}
            onFocus={handleSubmenuTriggerMouseEnter}
          >
            <span className='editor-context-menu-icon'>{entry.icon}</span>
            <span className='editor-context-menu-label'>{entry.label}</span>
            <span className='editor-context-menu-submenu-caret'>›</span>
            <div className='editor-context-submenu' role='menu'>
              {entry.submenu.map((subItem) =>
                subItem.separator ? (
                  <div
                    key={subItem.id}
                    className='editor-context-menu-separator'
                    role='separator'
                  />
                ) : (
                  <button
                    key={subItem.id}
                    className={`editor-context-menu-item${subItem.active ? ' active' : ''}${subItem.disabled ? ' disabled' : ''}`}
                    type='button'
                    role='menuitem'
                    disabled={subItem.disabled}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={subItem.action}
                    {...(subItem.dataAttrs ?? {})}
                  >
                    <span className='editor-context-menu-icon'>{subItem.icon}</span>
                    <span className='editor-context-menu-label'>{subItem.label}</span>
                    {subItem.shortcut && (
                      <span className='editor-context-menu-shortcut'>{subItem.shortcut}</span>
                    )}
                  </button>
                ),
              )}
            </div>
          </div>
        ) : (
          <button
            key={entry.id}
            className={`editor-context-menu-item${entry.active ? ' active' : ''}${entry.disabled ? ' disabled' : ''}`}
            type='button'
            role='menuitem'
            disabled={entry.disabled}
            onMouseDown={(event) => event.preventDefault()}
            onClick={entry.action}
            {...(entry.dataAttrs ?? {})}
          >
            <span className='editor-context-menu-icon'>{entry.icon}</span>
            <span className='editor-context-menu-label'>{entry.label}</span>
            {entry.shortcut && (
              <span className='editor-context-menu-shortcut'>{entry.shortcut}</span>
            )}
          </button>
        ),
      )}
    </div>
  )
}
