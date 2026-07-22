import { Node } from '@tiptap/core'

/** Tabler Icons: message-exclamation (static SVG paths, MIT) */
const TABLER_SVG_NS = 'http://www.w3.org/2000/svg'

const NOTE_ANCHOR_MARKER_SVG_ATTRS = {
  xmlns: TABLER_SVG_NS,
  width: '18',
  height: '18',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': '2',
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
} as const

const NOTE_ANCHOR_MARKER_SVG_PATHS = [
  { stroke: 'none', d: 'M0 0h24v24H0z', fill: 'none' },
  { d: 'M8 9h8' },
  { d: 'M8 13h6' },
  { d: 'M15 18h-2l-5 3v-3h-2a3 3 0 0 1 -3 -3v-8a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v5.5' },
  { d: 'M19 16v3' },
  { d: 'M19 22v.01' },
] as const

function renderNoteAnchorMarkerSvgSpec(): [string, Record<string, string>, ...unknown[]] {
  return [
    `${TABLER_SVG_NS} svg`,
    { ...NOTE_ANCHOR_MARKER_SVG_ATTRS },
    ...NOTE_ANCHOR_MARKER_SVG_PATHS.map((attrs) => [
      `${TABLER_SVG_NS} path`,
      attrs,
    ]),
  ]
}

/**
 * Inline atom node for Nyoze note anchors (付箋アンカー).
 *
 * Markdown 上の `<!-- nyoze-note:ID -->` に厳密一致する comment だけが
 * この node になる (parseMarkdown 側で判定)。それ以外の HTML comment は
 * 従来どおり html_inline_atom / html_block_atom として保持される。
 *
 * WYSIWYG 本文には Markdown comment 文字列を出さず、小さな付箋マーカーを表示する。
 * marker は本文文字ではなく editor-only の UI marker として扱う:
 * - 絵文字テキストは使わず、Tabler `message-exclamation` 相当の静的 SVG を埋め込む。
 * - outer は `contenteditable=false`、inner marker は `aria-hidden`。
 * - textContent は空のため、Markdown serialize / save / WYSIWYG 通常 copy へ
 *   marker の表示文字が混入しない。
 * - hover preview の足場として optional な `data-note-anchor-preview` 属性を置く。
 *   将来 NodeView / plugin view が notes.json 由来の title/text を差し込む余地で、
 *   schema 層では UI state (notes.json) を直結させない。
 * serializer は必ず `<!-- nyoze-note:ID -->` 形式へ戻す。
 */
export const NoteAnchor = Node.create({
  name: 'noteAnchor',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  marks: '',

  addAttributes() {
    return {
      id: {
        default: '',
      },
    }
  },

  parseHTML() {
    // Markdown からの parse は parseMarkdown が担当する。
    // HTML clipboard 由来の span[data-note-anchor-id] は同一 ID の付箋複製を
    // 作り得るため、WYSIWYG paste では noteAnchor として復元しない。
    return []
  },

  renderHTML({ node }) {
    const id = (node.attrs.id as string) ?? ''
    return [
      'span',
      {
        class: 'note-anchor',
        'data-note-anchor-id': id,
        // hover preview の足場。今は既定文言「付箋」。将来 notes.json 由来の
        // title/text を NodeView / plugin が差し込めるよう optional attr にする。
        'data-note-anchor-preview': '付箋',
        contenteditable: 'false',
        'aria-label': '付箋',
      },
      // Tabler message-exclamation 相当の静的 SVG marker。テキスト/絵文字は持たない。
      ['span', { class: 'note-anchor-marker', 'aria-hidden': 'true' }, renderNoteAnchorMarkerSvgSpec()],
    ]
  },
})
