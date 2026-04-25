import { useEffect } from 'react'
import type { RefObject } from 'react'
import type { EditorCoreHandle } from '../../editor-core/types'
import type { WritingMode } from '../../settings/types'
import type { SourceModeController } from './useSourceModeController'
import {
  getPlainShortcutUnavailableMessage,
  matchesLeftPaneToggleShortcut,
  matchesOutlineShortcut,
  matchesParagraphPlainToggleShortcut,
  matchesPlainBlockedEditorShortcut,
  matchesRightPaneToggleShortcut,
  matchesRubyInsertShortcut,
  type PlainModeKind,
} from '../utils/plainModeCommandGate'
import {
  isProseMirrorFocused,
  resolveSelectAllShortcutRoute,
  resolveSelectAllShortcutTargetInfo,
} from '../utils/selectAllShortcutRouting'

type UseGlobalShortcutsOptions = {
  coreRef: RefObject<EditorCoreHandle | null>
  sourceModeController: SourceModeController
  writingMode: WritingMode
  getPlainModeKind: () => PlainModeKind | null
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
      const mod = e.metaKey || e.ctrlKey
      const shift = e.shiftKey
      const alt = e.altKey

      // Search shortcuts (already handled elsewhere but kept for reference)
      if (mod && !shift && !alt && e.key === 'f') {
        e.preventDefault()
        onOpenSearch()
        return
      }
      if (mod && !shift && !alt && e.key === 'h') {
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
        if (e.isComposing || e.key === 'Process' || e.key === 'Unidentified') {
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
        if (e.isComposing || e.key === 'Process' || e.key === 'Unidentified') {
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
        if (e.isComposing || e.key === 'Process' || e.key === 'Unidentified') {
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
        if (e.isComposing || e.key === 'Process' || e.key === 'Unidentified') {
          return
        }
        e.preventDefault()
        onOpenRubyPrompt()
        return
      }

      // --- Mark commands ---
      if (mod && !shift && !alt && key === 'b') {
        e.preventDefault()
        core.execute('bold')
        return
      }
      if (mod && !shift && !alt && key === 'i') {
        e.preventDefault()
        core.execute('italic')
        return
      }
      if (mod && shift && !alt && key === 'x') {
        e.preventDefault()
        core.execute('strike')
        return
      }
      if (mod && !shift && !alt && key === 'k') {
        e.preventDefault()
        onOpenLinkPrompt()
        return
      }
      if (mod && shift && !alt && key === 'c') {
        e.preventDefault()
        core.clearFormat()
        return
      }

      // --- Heading commands ---
      if (mod && alt && !shift && key === '1') {
        e.preventDefault()
        core.toggleHeading(1)
        return
      }
      if (mod && alt && !shift && key === '2') {
        e.preventDefault()
        core.toggleHeading(2)
        return
      }
      if (mod && alt && !shift && key === '3') {
        e.preventDefault()
        core.toggleHeading(3)
        return
      }
      if (mod && alt && !shift && key === '0') {
        e.preventDefault()
        core.toggleHeading(0) // Convert to paragraph
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
      if (mod && !shift && !alt) {
        if (writingMode === 'horizontal-tb') {
          if (e.key === 'ArrowUp') {
            if (isProseMirrorFocused(document.activeElement)) {
              e.preventDefault()
              core.moveListItemUp()
            }
            return
          }
          if (e.key === 'ArrowDown') {
            if (isProseMirrorFocused(document.activeElement)) {
              e.preventDefault()
              core.moveListItemDown()
            }
            return
          }
        } else {
          // vertical-rl
          if (e.key === 'ArrowRight') {
            if (isProseMirrorFocused(document.activeElement)) {
              e.preventDefault()
              core.moveListItemUp()
            }
            return
          }
          if (e.key === 'ArrowLeft') {
            if (isProseMirrorFocused(document.activeElement)) {
              e.preventDefault()
              core.moveListItemDown()
            }
            return
          }
        }
      }

      // --- Outline navigation ---
      // event.code で判定し、レイアウト / Shift 合成で key が揺れても安定して
      // 拾えるようにする。物理キーは `,` / `.` / `L` (Comma / Period / KeyL)。
      // 縦書きでは視覚方向に合わせて `,` / `.` の意味を反転する (`comma` =
      // next, `period` = previous)。`fold` は writingMode 非依存。
      const outlineKind = matchesOutlineShortcut({
        code: e.code,
        key: e.key,
        mod,
        alt,
        shift,
      })
      if (outlineKind === 'fold') {
        e.preventDefault()
        core.toggleCurrentHeadingFold()
        return
      }
      if (outlineKind === 'comma') {
        e.preventDefault()
        if (writingMode === 'horizontal-tb') {
          core.jumpToPreviousHeading()
        } else {
          core.jumpToNextHeading()
        }
        return
      }
      if (outlineKind === 'period') {
        e.preventDefault()
        if (writingMode === 'horizontal-tb') {
          core.jumpToNextHeading()
        } else {
          core.jumpToPreviousHeading()
        }
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    coreRef,
    writingMode,
    getPlainModeKind,
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
