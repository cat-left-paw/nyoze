import type { Editor } from '@tiptap/core'
import { Selection } from '@tiptap/pm/state'
import { collectHeadingUiState } from './outlineTracking'
import {
  extractFoldPreview,
  findFoldedAncestor,
  headingFoldPluginKey,
  resolveFoldRange,
} from '../extensions/headingFold'
import type { HeadingInfo, HeadingUiSnapshot } from '../types'

type LogPush = (event: string, detail: string) => void

type CreateOutlineNavigationControllerOptions = {
  editor: Editor
  getIsComposing: () => boolean
  pushLog: LogPush
  emitFoldChange: () => void
}

export function createOutlineNavigationController({
  editor,
  getIsComposing,
  pushLog,
  emitFoldChange,
}: CreateOutlineNavigationControllerOptions): {
  toggleHeading: (level: number) => void
  getHeadings: () => HeadingInfo[]
  getHeadingSnapshot: () => HeadingUiSnapshot
  getActiveHeadingIndex: () => number
  toggleHeadingFold: (pos: number) => void
  getFoldedHeadingPositions: () => Set<number>
  unfoldAll: () => void
  scrollToPos: (pos: number) => void
  getHeadingPreview: (pos: number) => string
  jumpToPreviousHeading: () => boolean
  jumpToNextHeading: () => boolean
  toggleCurrentHeadingFold: () => boolean
} {
  function getHeadingSnapshot(): HeadingUiSnapshot {
    const pluginState = headingFoldPluginKey.getState(editor.state)
    return collectHeadingUiState({
      doc: editor.state.doc,
      selectionFrom: editor.state.selection.from,
      foldedHeadingPositions: pluginState?.folded ?? [],
    })
  }

  function getHeadings(): HeadingInfo[] {
    return getHeadingSnapshot().headings
  }

  function getActiveHeadingIndex(): number {
    return getHeadingSnapshot().activeHeadingIndex
  }

  function toggleHeading(level: number): void {
    if (getIsComposing()) return
    if (level <= 0) {
      editor.chain().focus().setParagraph().run()
      pushLog('command', 'toggleHeading(0)')
      return
    }
    if (editor.isActive('heading', { level })) {
      editor.chain().focus().setParagraph().run()
    } else {
      editor.chain().focus().toggleHeading({ level: level as 1 | 2 | 3 | 4 | 5 | 6 }).run()
    }
    pushLog('command', `toggleHeading(${level})`)
  }

  function toggleHeadingFold(pos: number): void {
    editor.commands.toggleHeadingFold(pos)
    pushLog('command', `toggleHeadingFold pos=${pos}`)
    emitFoldChange()
  }

  function getFoldedHeadingPositions(): Set<number> {
    const pluginState = headingFoldPluginKey.getState(editor.state)
    return new Set(pluginState?.folded ?? [])
  }

  function unfoldAll(): void {
    editor.commands.unfoldAll()
    pushLog('command', 'unfoldAll')
    emitFoldChange()
  }

  function scrollToPos(pos: number): void {
    const docSize = editor.state.doc.content.size
    const safePos = Math.max(0, Math.min(pos, docSize))

    // Auto-unfold if target is inside a folded section.
    const pluginState = headingFoldPluginKey.getState(editor.state)
    if (pluginState && pluginState.folded.length > 0) {
      const ancestor = findFoldedAncestor(editor.state.doc, pluginState.folded, safePos)
      if (ancestor >= 0) {
        editor.commands.toggleHeadingFold(ancestor)
        emitFoldChange()
      }
    }

    try {
      const resolvedPos = editor.state.doc.resolve(safePos)
      const selection = Selection.near(resolvedPos, 1)
      editor.view.dispatch(editor.state.tr.setSelection(selection).scrollIntoView())
      editor.commands.focus()
      const targetNode = editor.view.nodeDOM(safePos)
      const targetElement =
        targetNode instanceof Element
          ? targetNode
          : targetNode instanceof Text
            ? targetNode.parentElement
            : null
      const blockTarget = targetElement?.closest(
        'h1, h2, h3, h4, h5, h6, p, li, blockquote, pre',
      )

      if (blockTarget) {
        blockTarget.scrollIntoView({ block: 'start', inline: 'nearest' })
      }
    } catch {
      // pos may be unreachable in some edge cases; silently ignore.
    }
  }

  function getHeadingPreview(pos: number): string {
    const range = resolveFoldRange(editor.state.doc, pos)
    if (!range) return ''
    return extractFoldPreview(editor.state.doc, range.from, range.to)
  }

  function jumpToPreviousHeading(): boolean {
    // キャレットが所属する「現在見出し」を起点にし、その 1 つ手前を previous とする。
    // selection.from が heading.pos ちょうどでも、heading.pos + 1 以降にあっても
    // `resolveActiveHeadingIndex` が正しく所属見出しを返すので、境界条件で
    // 1 つ飛ばしてしまう旧バグ (cursorPos との大小比較のみに頼る実装) を避けられる。
    const snapshot = getHeadingSnapshot()
    const { headings, activeHeadingIndex } = snapshot
    if (headings.length === 0) return false
    if (activeHeadingIndex > 0) {
      scrollToPos(headings[activeHeadingIndex - 1].pos)
      return true
    }
    // キャレットが最初の見出しより前にあるときだけ、そこから最初の見出しに寄せる。
    if (activeHeadingIndex === -1) {
      scrollToPos(headings[0].pos)
      return true
    }
    return false
  }

  function jumpToNextHeading(): boolean {
    const snapshot = getHeadingSnapshot()
    const { headings, activeHeadingIndex } = snapshot
    if (headings.length === 0) return false
    const nextIndex = activeHeadingIndex + 1
    if (nextIndex < headings.length) {
      scrollToPos(headings[nextIndex].pos)
      return true
    }
    return false
  }

  function toggleCurrentHeadingFold(): boolean {
    const snapshot = getHeadingSnapshot()
    const activeIndex = snapshot.activeHeadingIndex
    if (activeIndex < 0) return false
    if (activeIndex >= snapshot.headings.length) return false
    toggleHeadingFold(snapshot.headings[activeIndex].pos)
    return true
  }

  return {
    toggleHeading,
    getHeadings,
    getHeadingSnapshot,
    getActiveHeadingIndex,
    toggleHeadingFold,
    getFoldedHeadingPositions,
    unfoldAll,
    scrollToPos,
    getHeadingPreview,
    jumpToPreviousHeading,
    jumpToNextHeading,
    toggleCurrentHeadingFold,
  }
}
