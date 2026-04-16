import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { CommandAvailability, EditorCoreHandle } from '../../editor-core/types'
import {
  getPlainContextMenuUnavailableMessage,
  type PlainModeKind,
} from '../utils/plainModeCommandGate'

export type ContextMenuState = {
  visible: boolean
  x: number
  y: number
  availability: CommandAvailability
}

const EMPTY_AVAILABILITY: CommandAvailability = {
  hasSelection: false,
  canBold: false,
  canItalic: false,
  canStrike: false,
  canHighlight: false,
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
  isInlineCode: false,
  isBulletList: false,
  isOrderedList: false,
  isChecklist: false,
  isBlockquote: false,
  isCodeBlock: false,
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
  })

  const menuRef = useRef<HTMLDivElement | null>(null)

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

      setMenu({ visible: true, x: e.clientX, y: e.clientY, availability })
    },
    [coreRef, editorDivRef, getPlainModeKind, onShowEditorInlineHint],
  )

  useEffect(() => {
    const editorDiv = editorDivRef.current
    if (!editorDiv) return
    editorDiv.addEventListener('contextmenu', handleContextMenu)
    return () => {
      editorDiv.removeEventListener('contextmenu', handleContextMenu)
    }
  }, [editorDivRef, handleContextMenu])

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
