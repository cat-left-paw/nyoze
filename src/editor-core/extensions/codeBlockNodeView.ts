/**
 * Code block NodeView — adds a display-only header with language label and copy button.
 *
 * DOM structure:
 *   div.code-block-wrapper
 *     div.code-block-header  (contenteditable=false)
 *       span.code-block-lang-label
 *       button.code-block-copy-btn
 *     pre.tategaki-code-block  (contentDOM — editable)
 *       code
 *
 * The editable `pre > code` content is preserved as `contentDOM` so ProseMirror
 * manages it normally. The header is non-editable chrome that does not affect
 * the document model.
 */

import type { Node as PMNode } from '@tiptap/pm/model'
import type { EditorView } from '@tiptap/pm/view'

/** Format a language attr value for display. */
function formatLanguageLabel(lang: string | null | undefined): string {
  if (!lang) return ''
  return lang.trim()
}

/** Copy text to clipboard, swallowing errors. */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export type CodeBlockNodeViewReturn = {
  dom: HTMLElement
  contentDOM: HTMLElement
  update: (node: PMNode) => boolean
  destroy: () => void
}

export function createCodeBlockNodeView(
  node: PMNode,
  // Required by TipTap NodeView signature but unused here
  _view: EditorView, // eslint-disable-line @typescript-eslint/no-unused-vars
  _getPos: (() => number | undefined) | boolean, // eslint-disable-line @typescript-eslint/no-unused-vars
): CodeBlockNodeViewReturn {
  // --- Wrapper ---
  const wrapper = document.createElement('div')
  wrapper.classList.add('code-block-wrapper')

  // --- Header (non-editable chrome) ---
  const header = document.createElement('div')
  header.classList.add('code-block-header')
  header.contentEditable = 'false'

  const langLabel = document.createElement('span')
  langLabel.classList.add('code-block-lang-label')
  const lang = formatLanguageLabel(node.attrs.language as string | null)
  langLabel.textContent = lang
  if (!lang) langLabel.style.visibility = 'hidden'

  const copyBtn = document.createElement('button')
  copyBtn.type = 'button'
  copyBtn.classList.add('code-block-copy-btn')
  copyBtn.textContent = 'Copy'

  header.appendChild(langLabel)
  header.appendChild(copyBtn)

  // --- Pre > Code (contentDOM — ProseMirror manages this) ---
  const pre = document.createElement('pre')
  pre.classList.add('tategaki-code-block')
  // Apply language class for CSS selectors (matches languageClassPrefix)
  if (lang) {
    pre.classList.add(`language-${lang}`)
  }

  const code = document.createElement('code')
  pre.appendChild(code)

  wrapper.appendChild(header)
  wrapper.appendChild(pre)

  // --- Copy handler ---
  let copyFeedbackTimer: ReturnType<typeof setTimeout> | null = null

  function handleCopy(event: MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
    const text = code.textContent ?? ''
    copyToClipboard(text).then((ok) => {
      if (ok) {
        copyBtn.textContent = 'Copied!'
        copyBtn.classList.add('copied')
        if (copyFeedbackTimer) clearTimeout(copyFeedbackTimer)
        copyFeedbackTimer = setTimeout(() => {
          copyBtn.textContent = 'Copy'
          copyBtn.classList.remove('copied')
          copyFeedbackTimer = null
        }, 1200)
      }
    })
  }

  copyBtn.addEventListener('mousedown', (e) => {
    // Prevent editor from losing focus/selection
    e.preventDefault()
  })
  copyBtn.addEventListener('click', handleCopy)

  // --- Update (language attr change) ---
  function update(updatedNode: PMNode): boolean {
    if (updatedNode.type.name !== 'codeBlock') return false
    const newLang = formatLanguageLabel(updatedNode.attrs.language as string | null)
    langLabel.textContent = newLang
    langLabel.style.visibility = newLang ? '' : 'hidden'

    // Update language class on pre
    const oldClasses = Array.from(pre.classList).filter((c) => c.startsWith('language-'))
    for (const c of oldClasses) pre.classList.remove(c)
    if (newLang) pre.classList.add(`language-${newLang}`)

    return true
  }

  // --- Cleanup ---
  function destroy() {
    if (copyFeedbackTimer) clearTimeout(copyFeedbackTimer)
    copyBtn.removeEventListener('click', handleCopy)
  }

  return {
    dom: wrapper,
    contentDOM: code,
    update,
    destroy,
  }
}
