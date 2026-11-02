import { Mark, type Node as PMNode } from '@tiptap/pm/model'
import type { EditorState } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import type { OwnerCaretGeometry, OwnerPreeditContext } from './editOwner'

/**
 * PIS-PREEDIT-INLINE-2: 入力面が変換中の文字を、Hostのwidgetと同じ位置へ組むための前後の文脈。
 *
 * 入力面は、ここで返す文字を透明な生成内容として前後に持ち、Hostの段落と同じ行分け・両端揃え・禁則で
 * preeditを組む。表示専用で、PM Doc・確定payload・入力面のDOMの文字には入らない。
 * compositionstartの配置の凍結時に、Hostのwidgetを置く前のlayoutから1回だけ読む。
 *
 * 文脈が「同じ書式の文字だけ」と証明できない場合はnullを返し、入力面は従来の表示（text-indent）のままにする。
 */

/** 前側は、caretの前の文字のある行から何行戻った行頭から複写するか。 */
const BACK_LINES = 1
/**
 * 段落の残りが短い場合。`text-wrap: pretty`は段落の最後の4行を組み直すので、その範囲より前の、
 * greedyで決まる行頭から複写する。
 */
const BACK_LINES_NEAR_END = 4
/**
 * 後ろ側がこの行数（送りの下限の見積もりで数える）以上あれば「長い」とみなして打ち切る。
 * 挿入位置がprettyの範囲（最後の4行）の外であることも保証する。
 */
const SUFFIX_LINES = 8
/**
 * 打ち切る場合に複写する行数。preeditの最後の行の残りと、その次の行（行末の禁則の先読み）があれば、
 * preeditのある行はHostと同じ行分け・両端揃えになる。
 */
const SUFFIX_COPY_LINES = 3
/** 行分け・字幅だけを変える書式。下線・背景・paddingを持つ書式は文脈へ線や余白が及ぶので対象外。 */
const SIMPLE_MARKS = new Set(['bold', 'italic'])
const ZWSP = '​'
const BIDI = /[֐-ࣿיִ-﷿ﹰ-ﻼ‎‏‪-‮⁦-⁩]/

export type PreeditRun = {
  readonly before: string
  readonly after: string
  /** caretが1つのtext nodeの中にある（前後が同じnode）。 */
  readonly joined: boolean
  readonly atBlockStart: boolean
  readonly atBlockEnd: boolean
}

/** 1文字（code unit）の送りの下限の見積もり（em）。行数を多く見積もらないための値。 */
export function minimumAdvanceEm(code: number): number {
  if (code < 0x20 || (code >= 0x0300 && code <= 0x036f) || (code >= 0x200b && code <= 0x200f) ||
    code === 0x2060 || code === 0x3099 || code === 0x309a || (code >= 0xfe00 && code <= 0xfe0f) || code === 0xfeff) return 0
  // かな・漢字
  if ((code >= 0x3040 && code <= 0x30ff) || (code >= 0x3400 && code <= 0x9fff) || (code >= 0xf900 && code <= 0xfaff)) return 1
  // CJKの約物・全角形（詰めで半分になり得る）
  if ((code >= 0x3000 && code <= 0x303f) || (code >= 0xff00 && code <= 0xffef)) return 0.5
  return 0.2
}

/** 送りの下限の合計が`budget`（px）へ達するまでのcode unit数。達しなければ`text.length`。 */
export function cutAtAdvance(text: string, fontSize: number, budget: number): number {
  let advance = 0
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index)
    advance += minimumAdvanceEm(code) * fontSize
    if (advance < budget) continue
    // surrogate pairの途中で切らない。
    return code >= 0xd800 && code <= 0xdbff && index + 1 < text.length ? index + 2 : index + 1
  }
  return text.length
}

/** PMの状態だけから、挿入位置の前後の「preeditと同じ書式の文字の連続」を取り出す。 */
export function resolvePreeditRun(state: EditorState, pos: number): PreeditRun | null {
  const $pos = state.doc.resolve(pos), parent = $pos.parent
  if (!parent.isTextblock || parent.type.spec.code) return null
  const marks = state.storedMarks ?? $pos.marks()
  if (marks.some(mark => !SIMPLE_MARKS.has(mark.type.name))) return null
  const usable = (node: PMNode | null): node is PMNode => !!node && node.isText && Mark.sameSet(node.marks, marks)
  const index = $pos.index(), last = parent.childCount - 1
  if ($pos.textOffset > 0) {
    const node = parent.child(index)
    if (!usable(node)) return null
    const text = node.text ?? ''
    return { before: text.slice(0, $pos.textOffset), after: text.slice($pos.textOffset), joined: true, atBlockStart: index === 0, atBlockEnd: index === last }
  }
  const previous = index > 0 ? parent.child(index - 1) : null, next = index <= last ? parent.child(index) : null
  // 前は段落の先頭か同じ書式の文字、後ろは段落の末尾か同じ書式の文字。Ruby・TCY・atom・別の書式は対象外。
  if ((previous && !usable(previous)) || (next && !usable(next))) return null
  return {
    before: previous?.text ?? '', after: next?.text ?? '', joined: false,
    atBlockStart: previous ? index === 1 : true, atBlockEnd: next ? index === last : true,
  }
}

/** 後ろ側の文脈。長ければ打ち切る。短いのに段落の末尾まで届かない（後ろにRuby等がある）場合はnull。 */
export function planPreeditSuffix(run: PreeditRun, fontSize: number, inlineSize: number): { after: string; truncated: boolean } | null {
  if (cutAtAdvance(run.after, fontSize, SUFFIX_LINES * inlineSize) < run.after.length) {
    return { after: run.after.slice(0, cutAtAdvance(run.after, fontSize, SUFFIX_COPY_LINES * inlineSize)), truncated: true }
  }
  return run.atBlockEnd ? { after: run.after, truncated: false } : null
}

function textNodeAt(view: EditorView, pos: number, side: -1 | 1, expected: string, offset: number): Text | null {
  const at = view.domAtPos(pos, side)
  // decorationで分割されたtext、widget、sentinelの中は対象外（同じ文字列の1つのtext nodeだけ）。
  return at.node.nodeType === Node.TEXT_NODE && (at.node as Text).data === expected && at.offset === offset ? at.node as Text : null
}

/** Hostの挿入位置の前後の文脈。widgetを置く前のlayoutで呼ぶ。読むだけで、DOM・Selectionは変えない。 */
export function resolveHostPreeditContext(view: EditorView, pos: number, caret: OwnerCaretGeometry): OwnerPreeditContext | null {
  try {
    const run = resolvePreeditRun(view.state, pos)
    if (!run || (!run.before && !run.after) || BIDI.test(run.before) || BIDI.test(run.after)) return null
    const whole = run.before + run.after
    const beforeNode = run.before ? textNodeAt(view, pos, -1, run.joined ? whole : run.before, run.before.length) : null
    const afterNode = run.after ? textNodeAt(view, pos, 1, run.joined ? whole : run.after, run.joined ? run.before.length : 0) : null
    if ((run.before && !beforeNode) || (run.after && !afterNode)) return null
    const anchor = (beforeNode ?? afterNode)!.parentElement
    const block = anchor?.closest<HTMLElement>('p, h1, h2, h3, h4, h5, h6')
    if (!anchor || !block || !view.dom.contains(block)) return null

    const doc = view.dom.ownerDocument, win = doc.defaultView!
    const style = win.getComputedStyle(block), textStyle = win.getComputedStyle(anchor)
    const vertical = style.writingMode.startsWith('vertical')
    const fontSize = parseFloat(textStyle.fontSize), lineHeight = parseFloat(textStyle.lineHeight)
    if (!Number.isFinite(fontSize) || fontSize <= 0) return null
    const pitch = Number.isFinite(lineHeight) && lineHeight > 0 ? lineHeight : fontSize
    const box = block.getBoundingClientRect(), px = (property: string) => parseFloat(style.getPropertyValue(property)) || 0
    const inlineSize = vertical
      ? box.height - px('border-top-width') - px('padding-top') - px('border-bottom-width') - px('padding-bottom')
      : box.width - px('border-left-width') - px('padding-left') - px('border-right-width') - px('padding-right')
    if (!(inlineSize > 0)) return null

    const suffix = planPreeditSuffix(run, fontSize, inlineSize)
    if (!suffix) return null
    // 打ち切った文脈はgreedyの行分けを前提にする。段落全体で決まる行分け（balance等）は複写できない。
    const hostWrap = style.getPropertyValue('text-wrap')
    if (hostWrap !== 'pretty' && hostWrap !== 'wrap' && hostWrap !== 'nowrap') return null
    const textWrap = suffix.truncated && hostWrap === 'pretty' ? 'wrap' : hostWrap
    const caretCenter = vertical ? (caret.left + caret.right) / 2 : (caret.top + caret.bottom) / 2

    // 前が空なのは段落の先頭だけ（resolvePreeditRun）。そのときは従来の位置のまま、1行目から組む。
    let before = '', blockOffset = 0, firstLine = true
    if (beforeNode) {
      const range = doc.createRange()
      /** `node`の文字のある行の、block方向の中心。 */
      const centerIn = (node: Text, index: number) => {
        range.setStart(node, index); range.setEnd(node, index + 1)
        let rect = range.getBoundingClientRect()
        if (!rect.width && !rect.height && index > 0) { range.setStart(node, index - 1); rect = range.getBoundingClientRect() }
        return vertical ? (rect.left + rect.right) / 2 : (rect.top + rect.bottom) / 2
      }
      const center = (index: number) => centerIn(beforeNode, index)
      // 折り返しの位置で、caretが前の行の行末側に表示されている場合（行末のaffinity）。Hostは最初の文字を
      // 次の行頭へ組むが、入力面はcaretの位置から始める契約（S3）なので、従来の表示のままにする。
      if (afterNode) {
        const previousLine = center(run.before.length - 1)
        const nextLine = centerIn(afterNode, run.joined ? run.before.length : 0)
        if (Math.abs(previousLine - nextLine) >= pitch / 2 && Math.abs(caretCenter - previousLine) < pitch / 2) return null
      }
      /** `index`の文字と同じ行の最初の文字（行は文字の順に並ぶので二分探索）。 */
      const lineStart = (index: number) => {
        const line = center(index)
        let low = 0, high = index
        while (low < high) {
          const middle = (low + high) >> 1
          if (Math.abs(center(middle) - line) < pitch / 2) high = middle
          else low = middle + 1
        }
        return low
      }
      let start = lineStart(run.before.length - 1)
      for (let back = suffix.truncated ? BACK_LINES : BACK_LINES_NEAR_END; back > 0 && start > 0; back--) start = lineStart(start - 1)
      // 文字の連続の先頭が行頭かどうかは、段落の先頭でなければ証明できない。
      if (start === 0 && !run.atBlockStart) return null
      before = run.before.slice(start)
      firstLine = start === 0
      const first = center(start)
      const delta = style.writingMode === 'vertical-rl' ? first - caretCenter : caretCenter - first
      if (!Number.isFinite(delta) || delta < -pitch / 2) return null
      blockOffset = delta < 0.5 ? 0 : delta
    }
    // 段落末まで届く場合は、Hostの段落末の生成内容（縦書きのZWSP）も写す。
    const generated = !suffix.truncated && !!suffix.after && win.getComputedStyle(block, '::after').content.includes(ZWSP)
    return {
      before, after: generated ? suffix.after + ZWSP : suffix.after, blockOffset,
      indent: firstLine ? style.textIndent || '0px' : '0px', textWrap,
    }
  } catch {
    return null
  }
}
