import { Mark, mergeAttributes } from '@tiptap/core'

/**
 * Highlight mark — renders ==text== as <mark>.
 * Follows the same inclusive=false pattern as bold/italic/strike
 * to prevent decoration from "spreading" at boundaries.
 */
export const Highlight = Mark.create({
  name: 'highlight',

  inclusive() {
    return false
  },

  parseHTML() {
    return [{ tag: 'mark' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['mark', mergeAttributes({ class: 'tategaki-md-highlight' }, HTMLAttributes), 0]
  },
})
