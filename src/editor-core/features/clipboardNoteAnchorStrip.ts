import { Fragment, Slice } from '@tiptap/pm/model'
import type { Node as PMNode } from '@tiptap/pm/model'
import { NOTE_ANCHOR_NODE_NAME } from '../io/noteAnchor'

/**
 * CLIPBOARD-INTERNAL-PASTE1: コピーする slice から付箋の marker（noteAnchor）をすべて取り除く。
 *
 * 同じ id の付箋 anchor が貼り付けで複製されないようにするため。以前は、付箋に触れる選択の
 * `text/html` だけを marker を含まない平らな HTML に差し替えていたが、それでは貼り付けが
 * 「Nyoze の中でコピーした形」を使えない。slice 自体から marker を取り除いて、いつもの
 * `serializeForClipboard` の HTML（`data-pm-slice` つき）を使う。
 *
 * - noteAnchor は inline の leaf で文字を持たないので、`text/plain` / `text/markdown` は変わらない。
 * - `openStart` / `openEnd` は変えない（inline の leaf を消しても block の開き方は変わらない）。
 * - marker がなければ、同じ slice（同じ object）を返す。
 */
export function stripNoteAnchorsFromSlice(slice: Slice): Slice {
  const content = stripFragment(slice.content)
  return content === slice.content ? slice : new Slice(content, slice.openStart, slice.openEnd)
}

function stripFragment(fragment: Fragment): Fragment {
  let changed = false
  const children: PMNode[] = []
  fragment.forEach((child) => {
    if (child.type.name === NOTE_ANCHOR_NODE_NAME) {
      changed = true
      return
    }
    if (child.content.childCount === 0) {
      children.push(child)
      return
    }
    const content = stripFragment(child.content)
    if (content === child.content) {
      children.push(child)
      return
    }
    changed = true
    children.push(child.copy(content))
  })
  // Fragment.fromArray は、隣り合う同じ mark の text を 1 つにつなぐ。
  return changed ? Fragment.fromArray(children) : fragment
}
