import { Node } from '@tiptap/core'
import { buildImageDisplayUrl } from '../io/imageSecurity'

/**
 * SEC-5: Inline atom node for Markdown images.
 *
 * - Stores the original `src`, `alt`, and `title` from Markdown
 * - Renders valid local images via the `nyoze-img://` custom protocol
 * - Falls back to a placeholder badge for disallowed/missing images
 * - Serializer reconstructs `![alt](src)` or `![alt](src "title")` losslessly
 */
export const NyozeImage = Node.create({
  name: 'nyoze_image',
  group: 'inline',
  inline: true,
  atom: true,

  addAttributes() {
    return {
      src: { default: '' },
      alt: { default: '' },
      title: { default: null },
    }
  },

  parseHTML() {
    // Parsing from HTML is handled by the Markdown parser,
    // not by TipTap's built-in HTML parser.
    return []
  },

  renderHTML({ HTMLAttributes }) {
    // Fallback for SSR / non-NodeView contexts
    const alt = (HTMLAttributes.alt as string) || ''
    const src = (HTMLAttributes.src as string) || ''
    const label = `![${alt}](${src})`
    const truncated = label.length > 40 ? label.slice(0, 40) + '…' : label
    return ['span', {
      class: 'nyoze-image-placeholder',
      'data-nyoze-image': '',
      title: label,
      contenteditable: 'false',
    }, truncated]
  },

  addNodeView() {
    return ({ node }) => {
      const src = (node.attrs.src as string) || ''
      const alt = (node.attrs.alt as string) || ''
      const title = (node.attrs.title as string) || ''
      const displayUrl = buildImageDisplayUrl(src)

      const dom = document.createElement('span')
      dom.classList.add('nyoze-image-wrapper')
      dom.contentEditable = 'false'

      if (displayUrl) {
        const img = document.createElement('img')
        img.src = displayUrl
        img.alt = alt
        if (title) img.title = title
        img.classList.add('nyoze-image')
        img.draggable = false
        img.onerror = () => {
          // Image failed to load → replace with placeholder
          if (dom.contains(img)) {
            dom.removeChild(img)
          }
          dom.appendChild(makePlaceholder(src, alt))
        }
        dom.appendChild(img)
      } else {
        dom.appendChild(makePlaceholder(src, alt))
      }

      return { dom }
    }
  },
})

function makePlaceholder(src: string, alt: string): HTMLSpanElement {
  const label = `![${alt}](${src})`
  const truncated = label.length > 40 ? label.slice(0, 40) + '…' : label

  const span = document.createElement('span')
  span.className = 'nyoze-image-placeholder'
  span.setAttribute('data-nyoze-image', '')
  span.title = label
  span.textContent = truncated
  return span
}
