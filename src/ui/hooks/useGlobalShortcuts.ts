import { useEffect } from 'react'
import type { RefObject } from 'react'
import type { EditorCoreHandle } from '../../editor-core/types'
import type { WritingMode } from '../../settings/types'
import type { SourceModeController } from './useSourceModeController'
import {
  getPlainShortcutUnavailableMessage,
  isImeUnsafeShortcutKeyboardEvent,
  matchesLeftPaneToggleShortcut,
  matchesOutlineShortcut,
  matchesParagraphPlainToggleShortcut,
  matchesPlainBlockedEditorShortcut,
  matchesRightPaneToggleShortcut,
  matchesRubyInsertShortcut,
  type PlainModeKind,
} from '../utils/plainModeCommandGate'
import {
  resolveSelectAllShortcutRoute,
  resolveSelectAllShortcutTargetInfo,
} from '../utils/selectAllShortcutRouting'
import { classifyEditorMarkShortcut } from '../../editor-core/features/editorMarkShortcutClassification'
import {
  classifyEditorBlockStructureShortcut,
} from '../../editor-core/features/editorBlockStructureShortcutClassification'
import { runLocalImeOutlineCommand } from '../utils/localImeOutlineCommandPreflight'
import { classifyListMoveShortcutTarget } from '../utils/listMoveShortcutTarget'
import { runLocalImeListMoveCommand } from '../utils/localImeListMoveCommandPreflight'
import {
  isLocalImeHostBlockStructureShortcutFocusOwner,
  runLocalImeHostCommand,
} from '../utils/localImeHostCommandPreflight'

type UseGlobalShortcutsOptions = {
  coreRef: RefObject<EditorCoreHandle | null>
  sourceModeController: SourceModeController
  writingMode: WritingMode
  getPlainModeKind: () => PlainModeKind | null
  /** Built-in read-only internal docs (shortcut reference): block editing shortcuts only. */
  getInternalDocActive?: () => boolean
  onOpenSearch: () => void
  onOpenSearchReplace: () => void
  onOpenLinkPrompt: () => void
  onOpenRubyPrompt: () => void
  onShowEditorInlineHint: (message: string) => void
  onToggleParagraphPlainMode: () => void
  onToggleLeftPane: () => void
  onToggleRightPane: () => void
}

/**
 * Global keyboard shortcuts for editor operations.
 *
 * Delegates to EditorCore for mark commands (bold/italic/strike),
 * link prompt, structure commands (heading toggle, list move), and outline navigation.
 *
 * Guards:
 * - IME composition (handled by EditorCore)
 * - Plain Edit modes (Paragraph Plain / Full Plain)
 * - Search bar focus (search shortcuts handled separately)
 */
export function useGlobalShortcuts({
  coreRef,
  sourceModeController,
  writingMode,
  getPlainModeKind,
  getInternalDocActive,
  onOpenSearch,
  onOpenSearchReplace,
  onOpenLinkPrompt,
  onOpenRubyPrompt,
  onShowEditorInlineHint,
  onToggleParagraphPlainMode,
  onToggleLeftPane,
  onToggleRightPane,
}: UseGlobalShortcutsOptions) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Windows AltGr は ctrl+alt として届く。pane / Paragraph Plain / Ruby 等の
      // code 基準 shortcut として消費せず、通常文字入力へ委譲する。
      // macOS Option は AltGraph=false のまま既存 shortcut を維持する。
      if (
        typeof e.getModifierState === 'function' &&
        e.getModifierState('AltGraph')
      ) {
        return
      }
      const mod = e.metaKey || e.ctrlKey
      const shift = e.shiftKey
      const alt = e.altKey

      // Search shortcuts (already handled elsewhere but kept for reference)
      // P2-G2b: armed 局所 IME slot 中の IME 合成 keydown はここで消費しない。
      if (mod && !shift && !alt && e.key === 'f') {
        if (
          isImeUnsafeShortcutKeyboardEvent({
            isComposing: e.isComposing,
            keyCode: e.keyCode,
            key: e.key,
            cancelable: e.cancelable,
          })
        ) {
          return
        }
        e.preventDefault()
        onOpenSearch()
        return
      }
      if (mod && !shift && !alt && e.key === 'h') {
        if (
          isImeUnsafeShortcutKeyboardEvent({
            isComposing: e.isComposing,
            keyCode: e.keyCode,
            key: e.key,
            cancelable: e.cancelable,
          })
        ) {
          return
        }
        e.preventDefault()
        onOpenSearchReplace()
        return
      }

      // 左右 pane toggle は editor command ではないので、defaultPrevented 早期 return
      // や plain mode guard より前に処理する。IME 中でも window.keydown は来ないため
      // 特別扱いは不要だが、composition 中は念のため抜ける。
      if (
        matchesLeftPaneToggleShortcut({
          code: e.code,
          key: e.key,
          mod,
          alt,
          shift,
        })
      ) {
        if (
          isImeUnsafeShortcutKeyboardEvent({
            isComposing: e.isComposing,
            keyCode: e.keyCode,
            key: e.key,
            cancelable: e.cancelable,
          })
        ) {
          return
        }
        e.preventDefault()
        onToggleLeftPane()
        return
      }
      if (
        matchesRightPaneToggleShortcut({
          code: e.code,
          key: e.key,
          mod,
          alt,
          shift,
        })
      ) {
        if (
          isImeUnsafeShortcutKeyboardEvent({
            isComposing: e.isComposing,
            keyCode: e.keyCode,
            key: e.key,
            cancelable: e.cancelable,
          })
        ) {
          return
        }
        e.preventDefault()
        onToggleRightPane()
        return
      }

      // Avoid double execution when ProseMirror/TipTap has already handled the shortcut
      // (e.g. Mod+Alt+1..6 heading shortcuts).
      if (e.defaultPrevented) {
        return
      }

      const plainModeKind = getPlainModeKind()
      const key = e.key.toLowerCase()
      const core = coreRef.current

      if (mod && !shift && !alt && key === 'a') {
        const route = resolveSelectAllShortcutRoute({
          targetInfo: resolveSelectAllShortcutTargetInfo(document.activeElement),
          plainModeKind,
          hasEditorCore: core !== null,
          hasFullPlainEditor: sourceModeController.hasEditor(),
        })

        if (route === 'native' || route === 'none') {
          return
        }

        e.preventDefault()
        if (route === 'full-plain') {
          sourceModeController.selectAll()
          return
        }
        if (route === 'paragraph-plain') {
          core?.selectAllParagraphPlain()
          return
        }
        core?.selectAll()
        return
      }

      // Paragraph Plain toggle: Cmd/Ctrl + Alt/Option + P.
      // Must be evaluated before the plain-mode guard so the same shortcut can
      // commit and exit Paragraph Plain. Disabled while Source Mode is active.
      // IME 未確定中は toggle を通さない（確定順依存で入力を落とす事故を防ぐ）。
      if (
        matchesParagraphPlainToggleShortcut({
          code: e.code,
          key: e.key,
          mod,
          alt,
          shift,
        })
      ) {
        if (plainModeKind === 'full-plain') {
          return
        }
        if (
          isImeUnsafeShortcutKeyboardEvent({
            isComposing: e.isComposing,
            keyCode: e.keyCode,
            key: e.key,
            cancelable: e.cancelable,
          })
        ) {
          return
        }
        if (getInternalDocActive?.()) {
          e.preventDefault()
          return
        }
        e.preventDefault()
        onToggleParagraphPlainMode()
        return
      }

      // Guard: do not execute editor commands in Plain Edit modes
      if (plainModeKind) {
        if (
          matchesPlainBlockedEditorShortcut({
            key: e.key,
            code: e.code,
            mod,
            shift,
            alt,
            writingMode,
          })
        ) {
          e.preventDefault()
          onShowEditorInlineHint(getPlainShortcutUnavailableMessage(plainModeKind))
        }
        return
      }
      if (!core) return

      // Outline navigation (allowed on internal read-only docs — reading aid)
      // P2-G2c1: armed 局所 IME slot 中は、既存 P1 document-action barrier で
      // session を teardown した後の実 PM selection を正本として既存 Outline
      // command を 1 回だけ実行する（composing / busy / recovery-required では
      // 実行せず、fallback しない）。
      const outlineKind = matchesOutlineShortcut({
        code: e.code,
        key: e.key,
        mod,
        alt,
        shift,
      })
      if (outlineKind === 'fold') {
        if (
          isImeUnsafeShortcutKeyboardEvent({
            isComposing: e.isComposing,
            keyCode: e.keyCode,
            key: e.key,
            cancelable: e.cancelable,
          })
        ) {
          return
        }
        e.preventDefault()
        runLocalImeOutlineCommand('outline-fold-toggle', () => {
          core.toggleCurrentHeadingFold()
        })
        return
      }
      if (outlineKind === 'comma') {
        if (
          isImeUnsafeShortcutKeyboardEvent({
            isComposing: e.isComposing,
            keyCode: e.keyCode,
            key: e.key,
            cancelable: e.cancelable,
          })
        ) {
          return
        }
        e.preventDefault()
        if (writingMode === 'horizontal-tb') {
          runLocalImeOutlineCommand('outline-jump-previous-heading', () => {
            core.jumpToPreviousHeading()
          })
        } else {
          runLocalImeOutlineCommand('outline-jump-next-heading', () => {
            core.jumpToNextHeading()
          })
        }
        return
      }
      if (outlineKind === 'period') {
        if (
          isImeUnsafeShortcutKeyboardEvent({
            isComposing: e.isComposing,
            keyCode: e.keyCode,
            key: e.key,
            cancelable: e.cancelable,
          })
        ) {
          return
        }
        e.preventDefault()
        if (writingMode === 'horizontal-tb') {
          runLocalImeOutlineCommand('outline-jump-next-heading', () => {
            core.jumpToNextHeading()
          })
        } else {
          runLocalImeOutlineCommand('outline-jump-previous-heading', () => {
            core.jumpToPreviousHeading()
          })
        }
        return
      }

      const internalDocActive = getInternalDocActive?.()
      if (internalDocActive) {
        return
      }

      // Ruby 挿入 shortcut: Cmd/Ctrl+Alt+R
      // IME 未確定中、defaultPrevented 済みのイベント (ProseMirror keymap 等) は既に
      // 上で return されている。ここでは Source Mode / Paragraph Plain の後なので、
      // 通常 WYSIWYG 編集時のみ発火する。
      if (
        matchesRubyInsertShortcut({
          code: e.code,
          key: e.key,
          mod,
          alt,
          shift,
        })
      ) {
        if (
          isImeUnsafeShortcutKeyboardEvent({
            isComposing: e.isComposing,
            keyCode: e.keyCode,
            key: e.key,
            cancelable: e.cancelable,
          })
        ) {
          return
        }
        e.preventDefault()
        onOpenRubyPrompt()
        return
      }

      // --- Mark commands（割り当ては editorMarkShortcutClassification と共有） ---
      const markShortcut = classifyEditorMarkShortcut({
        key: e.key,
        metaKey: e.metaKey,
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
      })
      if (markShortcut) {
        e.preventDefault()
        core.execute(markShortcut)
        return
      }
      if (mod && !shift && !alt && key === 'k') {
        if (
          isImeUnsafeShortcutKeyboardEvent({
            isComposing: e.isComposing,
            keyCode: e.keyCode,
            key: e.key,
            cancelable: e.cancelable,
          })
        ) {
          return
        }
        e.preventDefault()
        onOpenLinkPrompt()
        return
      }

      // --- Heading / Clear Format（割り当ては editorBlockStructureShortcutClassification と共有） ---
      const blockStructure = classifyEditorBlockStructureShortcut({
        key: e.key,
        code: e.code,
        metaKey: e.metaKey,
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        altGraphKey:
          typeof e.getModifierState === 'function' && e.getModifierState('AltGraph'),
        isComposing: e.isComposing,
        keyCode: e.keyCode,
        cancelable: e.cancelable,
      })
      if (blockStructure === 'clear-format') {
        e.preventDefault()
        core.clearFormat()
        return
      }
      if (
        blockStructure === 'heading-1' ||
        blockStructure === 'heading-2' ||
        blockStructure === 'heading-3' ||
        blockStructure === 'paragraph'
      ) {
        const headingLevel =
          blockStructure === 'heading-1' ? 1
          : blockStructure === 'heading-2' ? 2
          : blockStructure === 'heading-3' ? 3
          : 0
        if (!isLocalImeHostBlockStructureShortcutFocusOwner(document.activeElement)) {
          return
        }
        e.preventDefault()
        runLocalImeHostCommand('host-command-heading', () => {
          core.toggleHeading(headingLevel)
        })
        return
      }

      // --- List move commands (writing-mode dependent) ---
      // horizontal-tb: Mod+ArrowUp = moveUp, Mod+ArrowDown = moveDown
      // vertical-rl: Mod+ArrowRight = moveUp, Mod+ArrowLeft = moveDown
      //
      // On macOS, Cmd+ArrowUp/Down is a native caret-jump (doc start/end).
      // Only intercept when the ProseMirror editor itself has focus — not when
      // focus is on a button, Explorer panel, native input, or any other element.
      // When the editor has focus, always call preventDefault regardless of
      // whether the item can actually move, so the native jump never fires for
      // non-moveable positions (heading, plain paragraph, first/last list item).
      //
      // Local Window focus時はdocument-action barrierで安全にcloseしてから、
      // 既存moveListItemUp/Downをexact 1回だけ実行する。
      // `isProseMirrorFocused()` 自体は変更せず、`classifyListMoveShortcutTarget()`
      // が内部でそのまま再利用する。
      if (mod && !shift && !alt) {
        if (writingMode === 'horizontal-tb') {
          if (e.key === 'ArrowUp') {
            const targetKind = classifyListMoveShortcutTarget(document.activeElement)
            if (targetKind === 'prosemirror') {
              e.preventDefault()
              core.moveListItemUp()
            } else if (targetKind === 'local-window') {
              if (
                isImeUnsafeShortcutKeyboardEvent({
                  isComposing: e.isComposing,
                  keyCode: e.keyCode,
                  key: e.key,
                  cancelable: e.cancelable,
                })
              ) {
                return
              }
              e.preventDefault()
              runLocalImeListMoveCommand('list-move-up', () => {
                core.moveListItemUp()
              })
            }
            return
          }
          if (e.key === 'ArrowDown') {
            const targetKind = classifyListMoveShortcutTarget(document.activeElement)
            if (targetKind === 'prosemirror') {
              e.preventDefault()
              core.moveListItemDown()
            } else if (targetKind === 'local-window') {
              if (
                isImeUnsafeShortcutKeyboardEvent({
                  isComposing: e.isComposing,
                  keyCode: e.keyCode,
                  key: e.key,
                  cancelable: e.cancelable,
                })
              ) {
                return
              }
              e.preventDefault()
              runLocalImeListMoveCommand('list-move-down', () => {
                core.moveListItemDown()
              })
            }
            return
          }
        } else {
          // vertical-rl
          if (e.key === 'ArrowRight') {
            const targetKind = classifyListMoveShortcutTarget(document.activeElement)
            if (targetKind === 'prosemirror') {
              e.preventDefault()
              core.moveListItemUp()
            } else if (targetKind === 'local-window') {
              if (
                isImeUnsafeShortcutKeyboardEvent({
                  isComposing: e.isComposing,
                  keyCode: e.keyCode,
                  key: e.key,
                  cancelable: e.cancelable,
                })
              ) {
                return
              }
              e.preventDefault()
              runLocalImeListMoveCommand('list-move-up', () => {
                core.moveListItemUp()
              })
            }
            return
          }
          if (e.key === 'ArrowLeft') {
            const targetKind = classifyListMoveShortcutTarget(document.activeElement)
            if (targetKind === 'prosemirror') {
              e.preventDefault()
              core.moveListItemDown()
            } else if (targetKind === 'local-window') {
              if (
                isImeUnsafeShortcutKeyboardEvent({
                  isComposing: e.isComposing,
                  keyCode: e.keyCode,
                  key: e.key,
                  cancelable: e.cancelable,
                })
              ) {
                return
              }
              e.preventDefault()
              runLocalImeListMoveCommand('list-move-down', () => {
                core.moveListItemDown()
              })
            }
            return
          }
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    coreRef,
    writingMode,
    getPlainModeKind,
    getInternalDocActive,
    onOpenSearch,
    onOpenSearchReplace,
    onOpenLinkPrompt,
    onOpenRubyPrompt,
    onShowEditorInlineHint,
    onToggleParagraphPlainMode,
    onToggleLeftPane,
    onToggleRightPane,
    sourceModeController,
  ])
}
