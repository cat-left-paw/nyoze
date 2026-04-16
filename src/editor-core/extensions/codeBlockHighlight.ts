/**
 * Code block with syntax highlighting via lowlight.
 *
 * Replaces the StarterKit default codeBlock.
 * - Uses lowlight (common) which covers ~40 popular languages.
 * - Preserves the existing `tategaki-code-block` class.
 * - Language alias normalization is handled at the CSS/display layer only —
 *   the stored `language` attr remains exactly as the user wrote it.
 * - **No auto-detect**: unknown / missing language renders as plain text.
 */

import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { findChildren } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { lowlight } from 'lowlight'
import { normalizeCodeBlockLanguage } from '../features/codeBlockLanguage'
import { createCodeBlockNodeView } from './codeBlockNodeView'

/**
 * Register common aliases so lowlight can resolve short names like `py`, `js`, etc.
 */
function registerLanguageAliases(): void {
  const aliasMap: Record<string, string[]> = {
    javascript: ['js'],
    typescript: ['ts'],
    python: ['py'],
    ruby: ['rb'],
    bash: ['sh', 'shell', 'zsh'],
    xml: ['html', 'htm'],
    yaml: ['yml'],
    rust: ['rs'],
    markdown: ['md'],
    json: ['jsonc'],
  }

  for (const [canonical, aliases] of Object.entries(aliasMap)) {
    if (lowlight.registered(canonical)) {
      for (const alias of aliases) {
        lowlight.registerAlias(canonical, alias)
      }
    }
  }
}

registerLanguageAliases()

/**
 * Check if a language string resolves to a registered lowlight language.
 */
export function isLanguageRegistered(lang: string | null | undefined): boolean {
  if (!lang) return false
  const normalized = normalizeCodeBlockLanguage(lang)
  if (!normalized) return false
  return lowlight.registered(normalized)
}

// --- Decoration helpers (ported from @tiptap/extension-code-block-lowlight) ---

type HastNode = {
  type: string
  tagName?: string
  properties?: { className?: string[] }
  children?: HastNode[]
  value?: string
}

interface ParsedNode {
  text: string
  classes: string[]
}

function getHighlightNodes(result: { children?: HastNode[] }): HastNode[] {
  return result.children || []
}

function parseNodes(nodes: HastNode[], className: string[] = []): ParsedNode[] {
  return nodes
    .map((node) => {
      if (node.type === 'element' && node.children) {
        const classes = [...className, ...(node.properties?.className || [])]
        return parseNodes(node.children, classes)
      }
      return { text: node.value || '', classes: className }
    })
    .flat()
}

/**
 * Build decorations for code blocks — only for registered languages.
 * Unknown / missing language → no decorations (plain text).
 */
function getDecorationsNoAutoDetect({
  doc,
  name,
}: {
  doc: import('@tiptap/pm/model').Node
  name: string
}): DecorationSet {
  const decorations: Decoration[] = []

  findChildren(doc, (node) => node.type.name === name).forEach((block) => {
    let from = block.pos + 1
    const language = block.node.attrs.language as string | undefined

    // Skip highlight if language is missing or unrecognized
    if (!language || !isLanguageRegistered(language)) {
      return
    }

    const canonical = normalizeCodeBlockLanguage(language)!
    const result = lowlight.highlight(canonical, block.node.textContent)
    const nodes = getHighlightNodes(result)

    parseNodes(nodes).forEach((node) => {
      const to = from + node.text.length
      if (node.classes.length) {
        decorations.push(Decoration.inline(from, to, { class: node.classes.join(' ') }))
      }
      from = to
    })
  })

  return DecorationSet.create(doc, decorations)
}

const lowlightPluginKey = new PluginKey('lowlight')

/**
 * Custom lowlight plugin that never calls highlightAuto.
 */
function NoAutoDetectLowlightPlugin({ name }: { name: string }): Plugin {
  const plugin: Plugin = new Plugin({
    key: lowlightPluginKey,
    state: {
      init: (_, { doc }) => getDecorationsNoAutoDetect({ doc, name }),
      apply: (transaction, decorationSet, oldState, newState) => {
        const oldNodeName = oldState.selection.$head.parent.type.name
        const newNodeName = newState.selection.$head.parent.type.name
        const oldNodes = findChildren(oldState.doc, (node) => node.type.name === name)
        const newNodes = findChildren(newState.doc, (node) => node.type.name === name)

        if (
          transaction.docChanged &&
          ([oldNodeName, newNodeName].includes(name) ||
            newNodes.length !== oldNodes.length ||
            transaction.steps.some((step) => {
              const s = step as unknown as { from?: number; to?: number }
              return (
                s.from !== undefined &&
                s.to !== undefined &&
                oldNodes.some(
                  (node) => node.pos >= s.from! && node.pos + node.node.nodeSize <= s.to!,
                )
              )
            }))
        ) {
          return getDecorationsNoAutoDetect({ doc: transaction.doc, name })
        }

        return decorationSet.map(transaction.mapping, transaction.doc)
      },
    },
    props: {
      decorations(state) {
        return plugin.getState(state)
      },
    },
  })
  return plugin
}

/**
 * Lowlight code-block extension for WYSIWYG display.
 *
 * Extends CodeBlockLowlight but replaces the ProseMirror plugin
 * to suppress highlightAuto fallback for unknown/missing languages.
 */
export const NyozeCodeBlockHighlight = CodeBlockLowlight.extend({
  addNodeView() {
    return ({ node, view, getPos }) => createCodeBlockNodeView(node, view, getPos)
  },
  addProseMirrorPlugins() {
    // Filter out the original lowlight plugin from parent.
    // ProseMirror plugin.key is a string like "lowlight$", so we match by prefix.
    const parentPlugins = (this.parent?.() || []).filter((p: Plugin) => {
      const key = (p as unknown as { key: string }).key
      return typeof key !== 'string' || !key.startsWith('lowlight')
    })
    return [...parentPlugins, NoAutoDetectLowlightPlugin({ name: this.name })]
  },
}).configure({
  lowlight,
  HTMLAttributes: {
    class: 'tategaki-code-block',
  },
  languageClassPrefix: 'language-',
})

// Re-export for tests
export { normalizeCodeBlockLanguage }
