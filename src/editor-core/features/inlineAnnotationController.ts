import type { Editor } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import type { EditorState } from '@tiptap/pm/state'
import type { Node as PMNode } from '@tiptap/pm/model'
import { unwrapSelectedTcy } from './tcyFormatting'
import type {
  ClientRectSnapshot,
  LineBreakPolicy,
  ParagraphSourceContext,
  RubyEditContext,
  SelectionRange,
} from '../types'
import { validateDocumentLinkHref } from '../io/linkHrefSafety'

type LogPush = (event: string, detail: string) => void

type ParagraphNodeContextLike = {
  from: number
  to: number
  node: PMNode
}

export const validateSetLinkHref = validateDocumentLinkHref

type CreateInlineAnnotationControllerOptions = {
  editor: Editor
  getIsComposing: () => boolean
  getLineBreakPolicy: () => LineBreakPolicy
  pushLog: LogPush
  tcyValidPattern: RegExp
  resolveRubyEditContext: (state: EditorState, range: SelectionRange) => RubyEditContext | null
  resolveParagraphNodeContext: (
    state: EditorState,
    range: SelectionRange,
  ) => ParagraphNodeContextLike | null
  serializeParagraphNode: (state: EditorState, node: PMNode, lineBreakPolicy: LineBreakPolicy) => string
  parseSingleParagraphNode: (
    state: EditorState,
    markdown: string,
    lineBreakPolicy: LineBreakPolicy,
  ) => PMNode | null
  resolveParagraphElement: (editor: Editor, context: ParagraphNodeContextLike) => HTMLElement | null
  toClientRectSnapshot: (element: HTMLElement) => ClientRectSnapshot
}

export function createInlineAnnotationController({
  editor,
  getIsComposing,
  getLineBreakPolicy,
  pushLog,
  tcyValidPattern,
  resolveRubyEditContext,
  resolveParagraphNodeContext,
  serializeParagraphNode,
  parseSingleParagraphNode,
  resolveParagraphElement,
  toClientRectSnapshot,
}: CreateInlineAnnotationControllerOptions): {
  getLinkHref: () => string | undefined
  getSelectedText: () => string
  getSelectionRange: () => SelectionRange
  getRubyEditContext: () => RubyEditContext | null
  getParagraphSourceContext: (range?: SelectionRange) => ParagraphSourceContext | null
  insertRuby: (ruby: string, range?: SelectionRange) => void
  replaceParagraphSource: (markdown: string, range?: SelectionRange) => boolean
  getParagraphClientRect: (range?: SelectionRange) => ClientRectSnapshot | null
  toggleTcy: () => void
  insertBouten: (emphasisChar: string, range?: SelectionRange) => void
  setLink: (href: string | null, range?: SelectionRange) => void
  insertImage: (src: string, alt: string, title?: string) => void
} {
  function getLinkHref(): string | undefined {
    return editor.getAttributes('link').href as string | undefined
  }

  function getSelectedText(): string {
    const { from, to } = editor.state.selection
    if (from === to) return ''
    return editor.state.doc.textBetween(from, to, '')
  }

  function getSelectionRange(): SelectionRange {
    const { from, to } = editor.state.selection
    return { from, to }
  }

  function getRubyEditContextCommand(): RubyEditContext | null {
    return resolveRubyEditContext(editor.state, getSelectionRange())
  }

  function getParagraphSourceContextCommand(range?: SelectionRange): ParagraphSourceContext | null {
    const selectionRange = range ?? editor.state.selection
    const context = resolveParagraphNodeContext(editor.state, selectionRange)
    if (!context) return null
    return {
      from: context.from,
      to: context.to,
      markdown: serializeParagraphNode(editor.state, context.node, getLineBreakPolicy()),
    }
  }

  function insertRuby(ruby: string, range?: SelectionRange): void {
    const selectionRange = range ?? editor.state.selection
    const context = resolveRubyEditContext(editor.state, selectionRange)
    if (!context) return
    const { from, to, text: displayText } = context
    if (from === to) return
    if (!displayText) return

    const { state, view } = editor
    const { schema } = state
    const normalizedRuby = ruby.trim()

    // T7: 挿入前の早期 focus（旧 chain）だと、モーダル直後の DOM キャレットが不整合なとき
    // 先頭付近へスクロールしうる。replaceWith + 明示 TextSelection ののち view.focus。

    if (normalizedRuby === '') {
      const textNode = schema.text(displayText)
      const tr = state.tr.replaceWith(from, to, textNode)
      const endPos = Math.min(from + textNode.nodeSize, tr.doc.content.size)
      tr.setSelection(TextSelection.create(tr.doc, endPos))
      view.dispatch(tr)
      view.focus()
      pushLog('command', 'removeRuby')
      return
    }

    const aozoraRuby = schema.nodes['aozoraRuby']
    if (!aozoraRuby) {
      pushLog('command', 'insertRuby rejected: aozoraRuby missing in schema')
      return
    }
    const newNode = aozoraRuby.create(
      {
        ruby: normalizedRuby,
        hasDelimiter: context.overlapsExistingRuby ? context.hasDelimiter : true,
      },
      [schema.text(displayText)],
    )
    const tr2 = state.tr.replaceWith(from, to, newNode)
    const endPos2 = Math.min(from + newNode.nodeSize, tr2.doc.content.size)
    tr2.setSelection(TextSelection.create(tr2.doc, endPos2))
    view.dispatch(tr2)
    view.focus()
    pushLog('command', `insertRuby ${normalizedRuby}`)
  }

  function replaceParagraphSource(markdown: string, range?: SelectionRange): boolean {
    if (getIsComposing()) {
      pushLog('sourceEdit', 'replaceParagraph rejected: composing')
      return false
    }

    const selectionRange = range ?? editor.state.selection
    const context = resolveParagraphNodeContext(editor.state, selectionRange)
    if (!context) {
      pushLog('sourceEdit', 'replaceParagraph rejected: no paragraph target')
      return false
    }

    const nextParagraph = parseSingleParagraphNode(editor.state, markdown, getLineBreakPolicy())
    if (!nextParagraph) {
      pushLog('sourceEdit', 'replaceParagraph rejected: only single paragraph accepted')
      return false
    }

    const tr = editor.state.tr.replaceWith(context.from, context.to, nextParagraph)
    const mappedFrom = tr.mapping.map(context.from)
    const nextCursor = Math.max(1, Math.min(tr.doc.content.size, mappedFrom + 1))
    tr.setSelection(TextSelection.create(tr.doc, nextCursor))
    editor.view.dispatch(tr)
    pushLog('sourceEdit', 'replaceParagraph applied')
    return true
  }

  function getParagraphClientRect(range?: SelectionRange): ClientRectSnapshot | null {
    const selectionRange = range ?? editor.state.selection
    const context = resolveParagraphNodeContext(editor.state, selectionRange)
    if (!context) return null
    const paragraphEl = resolveParagraphElement(editor, context)
    if (!paragraphEl) return null
    return toClientRectSnapshot(paragraphEl)
  }

  function toggleTcy(): void {
    const removedCount = unwrapSelectedTcy(editor.state, (tr) => editor.view.dispatch(tr))
    if (removedCount > 0) {
      pushLog('command', `removeTcy count=${removedCount}`)
      return
    }

    const { from, to } = editor.state.selection
    if (from === to) return

    const selectedText = editor.state.doc.textBetween(from, to, '')
    if (!tcyValidPattern.test(selectedText)) {
      pushLog('command', `toggleTcy rejected: "${selectedText}"`)
      return
    }

    editor
      .chain()
      .focus()
      .deleteRange({ from, to })
      .insertContent({
        type: 'aozoraTcy',
        content: [{ type: 'text', text: selectedText }],
      })
      .run()
    pushLog('command', `insertTcy ${selectedText}`)
  }

  function insertBouten(emphasisChar: string, range?: SelectionRange): void {
    const { from, to } = range ?? editor.state.selection
    if (from === to) return
    const selectedText = editor.state.doc.textBetween(from, to, '')
    if (!selectedText) return

    const char = emphasisChar || '・'
    const chars = Array.from(selectedText)
    const content = chars.map((charText) => ({
      type: 'aozoraRuby',
      attrs: { ruby: char, hasDelimiter: true },
      content: [{ type: 'text', text: charText }],
    }))

    editor.chain().focus().deleteRange({ from, to }).insertContent(content).run()
    pushLog('command', `insertBouten ${char} (${chars.length} chars)`)
  }

  function setLink(href: string | null, range?: SelectionRange): void {
    const trimmedHref = href?.trim() ?? ''

    if (trimmedHref === '') {
      if (range) {
        editor.chain().focus().setTextSelection(range).run()
      }
      editor.chain().focus().unsetLink().run()
      pushLog('command', 'unsetLink')
      return
    }

    const safeHref = validateSetLinkHref(trimmedHref)
    if (!safeHref) return

    if (range) {
      editor.chain().focus().setTextSelection(range).run()
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: safeHref }).run()
    pushLog('command', `setLink ${safeHref}`)
  }

  function insertImage(src: string, alt: string, title?: string): void {
    const attrs: Record<string, string | null> = { src, alt, title: title || null }
    editor
      .chain()
      .focus()
      .insertContent({ type: 'nyoze_image', attrs })
      .run()
    pushLog('command', `insertImage ${src}`)
  }

  return {
    getLinkHref,
    getSelectedText,
    getSelectionRange,
    getRubyEditContext: getRubyEditContextCommand,
    getParagraphSourceContext: getParagraphSourceContextCommand,
    insertRuby,
    replaceParagraphSource,
    getParagraphClientRect,
    toggleTcy,
    insertBouten,
    setLink,
    insertImage,
  }
}
