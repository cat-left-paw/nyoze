import { useCallback, useMemo, useSyncExternalStore } from 'react'
import type { RefObject } from 'react'
import type { CommandAvailability, EditorCoreHandle } from '../../editor-core/types'
import type { SourceModeController } from './useSourceModeController'

type UseUndoRedoRoutingOptions = {
  coreRef: RefObject<EditorCoreHandle | null>
  fullPlainEditActive: boolean
  sourceModeController: SourceModeController
  paragraphPlainModeActive: boolean
  /** IME composing ref — when true, suppress undo/redo availability in regular editor. */
  imeComposingRef: RefObject<boolean>
  commandAvailability: CommandAvailability
}

type UndoRedoRouting = {
  handleUndo: () => void
  handleRedo: () => void
  /** CommandAvailability with canUndo/canRedo adjusted for the current editing context. */
  effectiveAvailability: CommandAvailability
}

/**
 * BETA-C1: Centralizes Undo/Redo routing so that toolbar buttons, keyboard shortcuts,
 * and availability indicators all agree on the same target.
 *
 * Routing rules (3-way):
 * - Regular editor: undo/redo via EditorCore (ProseMirror)
 * - Full Plain: undo/redo via Source Mode (CodeMirror history)
 * - Paragraph Plain: undo/redo via overlay textarea native
 *   (EditorCoreHandle.undoParagraphPlain/redoParagraphPlain)
 *
 * Availability rules:
 * - Regular editor: canUndo/canRedo from ProseMirror command availability,
 *   gated by IME composing (false during composition)
 * - Full Plain: canUndo/canRedo from Source Mode history depth
 * - Paragraph Plain: canUndo/canRedo always true (overlay textarea native undo)
 * - IME composing in regular editor: canUndo=false, canRedo=false
 */
export function useUndoRedoRouting({
  coreRef,
  fullPlainEditActive,
  sourceModeController,
  paragraphPlainModeActive,
  imeComposingRef,
  commandAvailability,
}: UseUndoRedoRoutingOptions): UndoRedoRouting {
  const sourceModeStateVersion = useSyncExternalStore(
    sourceModeController.subscribe,
    sourceModeController.getStateVersion,
    sourceModeController.getStateVersion,
  )
  const sourceModeHistory = useMemo(
    () => {
      void sourceModeStateVersion
      return {
        canUndo: sourceModeController.canUndo(),
        canRedo: sourceModeController.canRedo(),
      }
    },
    [sourceModeController, sourceModeStateVersion],
  )

  const handleUndo = useCallback(() => {
    if (fullPlainEditActive) {
      sourceModeController.undo()
      return
    }
    if (paragraphPlainModeActive) {
      coreRef.current?.undoParagraphPlain()
      return
    }
    coreRef.current?.undo()
  }, [coreRef, fullPlainEditActive, paragraphPlainModeActive, sourceModeController])

  const handleRedo = useCallback(() => {
    if (fullPlainEditActive) {
      sourceModeController.redo()
      return
    }
    if (paragraphPlainModeActive) {
      coreRef.current?.redoParagraphPlain()
      return
    }
    coreRef.current?.redo()
  }, [coreRef, fullPlainEditActive, paragraphPlainModeActive, sourceModeController])

  const effectiveAvailability = useMemo(() => {
    if (fullPlainEditActive) {
      return {
        ...commandAvailability,
        canUndo: sourceModeHistory.canUndo,
        canRedo: sourceModeHistory.canRedo,
      }
    }
    if (paragraphPlainModeActive) {
      // Paragraph Plain: overlay textarea native undo/redo — always enabled
      // since textarea undo history state is not queryable.
      return { ...commandAvailability, canUndo: true, canRedo: true }
    }
    // Regular editor: gate on IME composing — during composition, ProseMirror
    // undo/redo should not fire, and buttons should reflect that.
    if (imeComposingRef.current) {
      return { ...commandAvailability, canUndo: false, canRedo: false }
    }
    return commandAvailability
  }, [
    commandAvailability,
    fullPlainEditActive,
    imeComposingRef,
    paragraphPlainModeActive,
    sourceModeHistory,
  ])

  return { handleUndo, handleRedo, effectiveAvailability }
}
