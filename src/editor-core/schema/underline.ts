import { Mark, mergeAttributes } from '@tiptap/core'

/**
 * Underline mark — renders ||text|| as <u>.
 * Follows the same inclusive=false pattern as bold/italic/strike/highlight
 * to prevent decoration from "spreading" at boundaries.
 */
export const Underline = Mark.create({
  name: 'underline',

  inclusive() {
    return false
  },

  parseHTML() {
    return [{ tag: 'u' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['u', mergeAttributes({ class: 'tategaki-md-underline' }, HTMLAttributes), 0]
  },
})
