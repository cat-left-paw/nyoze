import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { CommandAvailability, EditorCoreHandle, SelectionRange } from '../../editor-core/types'
import { resolveNoteAnchorIdAtTarget } from '../../editor-core/features/noteAnchorProtection'
import {
  readEditorTextSelectionSignals,
  shouldPreferStandardContextMenuOverNoteAnchor,
} from '../utils/noteAnchorContextMenu'
import {
  getPlainContextMenuUnavailableMessage,
  type PlainModeKind,
} from '../utils/plainModeCommandGate'

export type ContextMenuState = {
  visible: boolean
  x: number
  y: number
  availability: CommandAvailability
  /** contextmenu 時点の DOM 上 noteAnchor id（NodeSelection 以外の marker 右クリック用） */
  domNoteAnchorContextId: string | null
  /** 右クリックした marker 要素。同一 ID 複製時の個別削除用。 */
  domNoteAnchorContextTarget: Element | null
  /** contextmenu 時点の PM selection（付箋追加など modal 前に固定する） */
  selectionRange: SelectionRange | null
  /** 右クリック時点で editor 内に非空テキスト選択があったか（PM / DOM / 直近 cache 統合） */
  hadTextSelectionAtOpen: boolean
}

const EMPTY_AVAILABILITY: CommandAvailability = {
  hasSelection: false,
  hasNonAnchorTextSelection: false,
  canBold: false,
  canItalic: false,
  canStrike: false,
  canHighlight: false,
  canUnderline: false,
  canInlineCode: false,
  canClearFormat: false,
  canBlockTransforms: false,
  canUndo: false,
  canRedo: false,
  canInsertRuby: false,
  canParagraphPlain: false,
  canToggleTcy: false,
  canCopy: false,
  canCut: false,
  canPaste: false,
  canSelectAll: false,
  canMoveListUp: false,
  canMoveListDown: false,
  isHeading: false,
  isBold: false,
  isItalic: false,
  isStrike: false,
  isHighlight: false,
  isUnderline: false,
  isInlineCode: false,
  isBulletList: false,
  isOrderedList: false,
  isChecklist: false,
  isBlockquote: false,
  isCodeBlock: false,
  canBlockDirective: false,
  blockDirectiveToken: null,
  canDeletePageBreak: false,
  noteAnchorContextId: null,
  touchesNoteAnchor: false,
  canShowNoteInPanel: false,
  canDeleteNoteAnchor: false,
}

type RightClickSnapshot = {
  hasTextSelection: boolean
  selectionRange: SelectionRange | null
}

function isSelectionExtendMouseEvent(e: MouseEvent): boolean {
  return e.shiftKey || e.metaKey || e.ctrlKey || e.altKey
}

function readCombinedTextSelection(
  editorDiv: HTMLElement,
  core: EditorCoreHandle | null,
  domSelection: Selection | null,
): { hasTextSelection: boolean; selectionRange: SelectionRange | null } {
  const signals = readEditorTextSelectionSignals(editorDiv, core, domSelection)
  const hasTextSelection = signals.pmHasSelection || signals.domHasTextSelection
  return {
    hasTextSelection,
    selectionRange: signals.selectionRange,
  }
}

export function useEditorContextMenu(
  coreRef: RefObject<EditorCoreHandle | null>,
  editorDivRef: RefObject<HTMLDivElement | null>,
  getPlainModeKind: () => PlainModeKind | null,
  onShowEditorInlineHint: (message: string) => void,
) {
  const [menu, setMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    availability: EMPTY_AVAILABILITY,
    domNoteAnchorContextId: null,
    domNoteAnchorContextTarget: null,
    selectionRange: null,
    hadTextSelectionAtOpen: false,
  })

  const menuRef = useRef<HTMLDivElement | null>(null)
  const rightClickSnapshotRef = useRef<RightClickSnapshot | null>(null)
  const recentEditorTextSelectionRef = useRef(false)

  const close = useCallback(() => {
    setMenu((prev) => (prev.visible ? { ...prev, visible: false } : prev))
  }, [])

  const handleContextMenu = useCallback(
    (e: MouseEvent) => {
      const editorDiv = editorDivRef.current
      if (!editorDiv) return
      if (!editorDiv.contains(e.target as Node)) return

      const plainModeKind = getPlainModeKind()
      if (plainModeKind) {
        onShowEditorInlineHint(getPlainContextMenuUnavailableMessage(plainModeKind))
        return
      }

      e.preventDefault()

      const core = coreRef.current
      const availability = core
        ? core.getCommandAvailability()
        : EMPTY_AVAILABILITY
      const atOpen = readCombinedTextSelection(
        editorDiv,
        core,
        window.getSelection(),
      )
      const snapshot = rightClickSnapshotRef.current
      rightClickSnapshotRef.current = null
      const preservedSelectionRange = snapshot?.selectionRange ?? atOpen.selectionRange
      const openSignals = readEditorTextSelectionSignals(
        editorDiv,
        core,
        window.getSelection(),
      )
      const hadTextSelectionAtOpen = shouldPreferStandardContextMenuOverNoteAnchor({
        pmHasSelection: openSignals.pmHasSelection,
        domHasTextSelection: openSignals.domHasTextSelection,
        hadRecentEditorTextSelection: recentEditorTextSelectionRef.current,
        snapshotHadTextSelection: snapshot?.hasTextSelection,
      })
      const domNoteAnchorContextId = resolveNoteAnchorIdAtTarget(e.target)
      const domNoteAnchorContextTarget = (() => {
        if (!domNoteAnchorContextId || !(e.target instanceof Element)) return null
        const marker = e.target.closest('.note-anchor[data-note-anchor-id]')
        return marker instanceof Element ? marker : null
      })()

      setMenu({
        visible: true,
        x: e.clientX,
        y: e.clientY,
        availability,
        domNoteAnchorContextId,
        domNoteAnchorContextTarget,
        selectionRange: preservedSelectionRange,
        hadTextSelectionAtOpen,
      })
    },
    [coreRef, editorDivRef, getPlainModeKind, onShowEditorInlineHint],
  )

  useEffect(() => {
    const editorDiv = editorDivRef.current
    if (!editorDiv) return

    const syncRecentSelectionFromEditor = () => {
      const core = coreRef.current
      const { hasTextSelection } = readCombinedTextSelection(
        editorDiv,
        core,
        window.getSelection(),
      )
      if (hasTextSelection) {
        recentEditorTextSelectionRef.current = true
      }
    }

    const handleMouseDown = (e: MouseEvent) => {
      if (!editorDiv.contains(e.target as Node)) return
      const core = coreRef.current

      if (e.button === 0) {
        if (!isSelectionExtendMouseEvent(e)) {
          recentEditorTextSelectionRef.current = false
        }
        return
      }

      if (e.button !== 2) return

      const snapshot = readCombinedTextSelection(editorDiv, core, window.getSelection())
      rightClickSnapshotRef.current = {
        hasTextSelection:
          snapshot.hasTextSelection || recentEditorTextSelectionRef.current,
        selectionRange: snapshot.selectionRange,
      }
    }

    const handleSelectionChange = () => {
      syncRecentSelectionFromEditor()
    }

    document.addEventListener('mousedown', handleMouseDown, true)
    editorDiv.addEventListener('contextmenu', handleContextMenu)
    document.addEventListener('selectionchange', handleSelectionChange)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown, true)
      editorDiv.removeEventListener('contextmenu', handleContextMenu)
      document.removeEventListener('selectionchange', handleSelectionChange)
    }
  }, [coreRef, editorDivRef, handleContextMenu])

  useEffect(() => {
    if (!menu.visible) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
      }
    }

    const onMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        close()
      }
    }

    const onScroll = () => close()
    const onResize = () => close()

    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('mousedown', onMouseDown, true)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)

    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('mousedown', onMouseDown, true)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  }, [menu.visible, close])

  return { menu, menuRef, close }
}
