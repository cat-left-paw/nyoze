/**
 * P2-G1b — Electron Edit menu Undo / Redo / Select All の renderer routing。
 *
 * - menu channel と window capture keydown を同一 dispatch へ集約
 * - Undo / Redo の割り当て（`Mod+Z` / `Mod+Shift+Z` / Windows `Ctrl+Y`）と AltGr 拒否は
 *   `classifyLocalImeHistoryChord()` を共有正本にする（WINDOWS1）
 * - core port を先に呼び、not-active のときだけ既存 surface へ委譲
 * - accelerator + keydown の二重適用を期限付き queue dedupe で抑止
 * - menu は outcome 確認後にだけ pair 登録（state-mismatch は非記録）
 * - 局所 slot の direct-arm（session off）は menu port の state-mismatch 時に
 *   slot keydown（P2-D1）へ委譲し、本番 session armed 時だけ menu port が消費する
 */

import { useCallback, useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import type { EditorCoreHandle } from '../../editor-core/types'
import type { LocalImeEditMenuOperation } from '../../editor-core/features/localImeEditMenuCommandState'
import {
  isLocalImeAltGraphBlocking,
  readLocalImeAltGraphState,
} from '../../editor-core/features/localImeHistoryHandoffState'
import type { SourceModeController } from './useSourceModeController'
import type { PlainModeKind } from '../utils/plainModeCommandGate'
import { extractEditMenuCommandTargetInfo } from '../utils/editMenuCommandTarget'
import { resolveEditMenuCommandRoute } from '../utils/editMenuCommandRouting'
import {
  classifyEditMenuKeyboardOperation,
  consumeOppositeEditMenuCommandPair,
  createEditMenuCommandDedupeState,
  dispatchEditMenuCommand,
  editMenuChannelToOperation,
  isEditMenuChannel,
  recordEditMenuCommandPending,
  shouldRecordEditMenuDedupePair,
  type EditMenuCommandDispatchOutcome,
} from '../utils/editMenuCommandDispatch'
import {
  nativeRedo,
  nativeSelectAll,
  nativeUndo,
} from '../utils/nativeEditCommands'

export type UseEditMenuCommandRoutingOptions = {
  coreRef: RefObject<EditorCoreHandle | null>
  sourceModeController: SourceModeController
  getPlainModeKind: () => PlainModeKind | null
  getInternalDocActive: () => boolean
  handleUndo: () => void
  handleRedo: () => void
}

export type EditMenuCommandRoutingApi = {
  /**
   * menu IPC channel を処理する。Edit の 3 channel なら true（呼び出し側は他 case へ進まない）。
   */
  handleMenuChannel: (command: string) => boolean
}

export function useEditMenuCommandRouting({
  coreRef,
  sourceModeController,
  getPlainModeKind,
  getInternalDocActive,
  handleUndo,
  handleRedo,
}: UseEditMenuCommandRoutingOptions): EditMenuCommandRoutingApi {
  const dedupeRef = useRef(createEditMenuCommandDedupeState())
  const handleUndoRef = useRef(handleUndo)
  const handleRedoRef = useRef(handleRedo)
  handleUndoRef.current = handleUndo
  handleRedoRef.current = handleRedo

  const runOperation = useCallback(
    (operation: LocalImeEditMenuOperation): EditMenuCommandDispatchOutcome => {
      return dispatchEditMenuCommand(operation, {
        routeLocalImeEditMenuCommand: (op) =>
          coreRef.current?.routeLocalImeEditMenuCommand(op) ?? null,
        extractTarget: () => extractEditMenuCommandTargetInfo(),
        plainModeKind: getPlainModeKind(),
        internalDocActive: getInternalDocActive(),
        hasEditorCore: coreRef.current !== null,
        hasFullPlainEditor: sourceModeController.hasEditor(),
        runSourceMode: (op) => {
          if (op === 'undo') sourceModeController.undo()
          else if (op === 'redo') sourceModeController.redo()
          else sourceModeController.selectAll()
        },
        runParagraphPlain: (op) => {
          const core = coreRef.current
          if (!core) return
          if (op === 'undo') core.undoParagraphPlain()
          else if (op === 'redo') core.redoParagraphPlain()
          else core.selectAllParagraphPlain()
        },
        runEditorUndoRedo: (op) => {
          if (op === 'undo') handleUndoRef.current()
          else handleRedoRef.current()
        },
        runEditorSelectAll: () => {
          coreRef.current?.selectAll()
        },
        runNative: (op) => {
          if (op === 'undo') nativeUndo()
          else if (op === 'redo') nativeRedo()
          else nativeSelectAll()
        },
        runReadOnlySelectAll: () => {
          coreRef.current?.selectAll()
        },
      })
    },
    [coreRef, getInternalDocActive, getPlainModeKind, sourceModeController],
  )

  const dispatchFromMenu = useCallback(
    (operation: LocalImeEditMenuOperation) => {
      const now = performance.now()
      if (
        consumeOppositeEditMenuCommandPair(
          dedupeRef.current,
          operation,
          'menu',
          now,
        )
      ) {
        return
      }
      const outcome = runOperation(operation)
      if (shouldRecordEditMenuDedupePair(outcome)) {
        recordEditMenuCommandPending(
          dedupeRef.current,
          operation,
          'menu',
          performance.now(),
        )
      }
    },
    [runOperation],
  )

  const handleMenuChannel = useCallback(
    (command: string): boolean => {
      if (!isEditMenuChannel(command)) return false
      const operation = editMenuChannelToOperation(command)
      if (!operation) return false
      dispatchFromMenu(operation)
      return true
    },
    [dispatchFromMenu],
  )

  useEffect(() => {
    function onKeyDownCapture(event: KeyboardEvent) {
      // LOCAL-WINDOW-WINDOWS1: この capture listener は target 側 keydown より先に
      // 走るので、untrusted の拒否も AltGr の拒否も Ctrl+Y の分類も**ここが最初の関門**になる。
      // 識別不能（`getModifierState` 欠落 / throw）は AltGr 扱いで拒否側へ倒す。
      const operation = classifyEditMenuKeyboardOperation({
        key: event.key,
        code: event.code,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        altGraphKey: isLocalImeAltGraphBlocking(readLocalImeAltGraphState(event)),
        // untrusted な script 生成 keydown で host Undo / Redo / Select All を実行しない。
        isTrusted: event.isTrusted,
        isComposing: event.isComposing,
        keyCode: event.keyCode,
        cancelable: event.cancelable,
      })
      if (!operation) return

      const target = extractEditMenuCommandTargetInfo(event.target)
      const route = resolveEditMenuCommandRoute({
        target,
        plainModeKind: getPlainModeKind(),
        internalDocActive: getInternalDocActive(),
        hasEditorCore: coreRef.current !== null,
        hasFullPlainEditor: sourceModeController.hasEditor(),
      })

      // native: browser default を生かし、続く menu accelerator IPC だけを抑止。
      // menu 先行で反対 pair が消費された場合は browser default も止める。
      if (route === 'native') {
        const now = performance.now()
        if (
          consumeOppositeEditMenuCommandPair(
            dedupeRef.current,
            operation,
            'keyboard',
            now,
          )
        ) {
          event.preventDefault()
          event.stopPropagation()
          return
        }
        recordEditMenuCommandPending(
          dedupeRef.current,
          operation,
          'keyboard',
          now,
        )
        return
      }

      if (route === 'blocked-dialog' || route === 'none') {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      const now = performance.now()
      if (
        consumeOppositeEditMenuCommandPair(
          dedupeRef.current,
          operation,
          'keyboard',
          now,
        )
      ) {
        return
      }
      const outcome = runOperation(operation)
      if (shouldRecordEditMenuDedupePair(outcome)) {
        recordEditMenuCommandPending(
          dedupeRef.current,
          operation,
          'keyboard',
          performance.now(),
        )
      }
    }

    window.addEventListener('keydown', onKeyDownCapture, true)
    return () => {
      window.removeEventListener('keydown', onKeyDownCapture, true)
    }
  }, [
    coreRef,
    getInternalDocActive,
    getPlainModeKind,
    runOperation,
    sourceModeController,
  ])

  return { handleMenuChannel }
}
