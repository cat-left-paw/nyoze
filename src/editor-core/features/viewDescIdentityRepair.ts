/**
 * EDITOR-VIEWDESC-IDENTITY-PERF1: ProseMirror の view の記録（view desc）が持つ node を、
 * 現在の文書の node と同じ object に保つ。
 *
 * 背景（prosemirror-view 1.41.9）:
 * - `preMatch()` は、文書の末尾から `desc.node` と新しい文書の node が**同じ object**である間だけ
 *   対応を取る。
 * - `findNodeMatch()` の予備の照合と `matchesNode()` は `node.eq()`（内容の一致）で対応とみなし、
 *   `desc.node` を更新しない。
 * - したがって、内容の等しい別 object の node へ差し替わった block（段落末尾の Enter で残る元の段落、
 *   文書の読み込みで前の文書と内容の等しい空段落、内容の等しい文書への全置換など）の desc は、
 *   古い object を持ち続ける。以後 `preMatch()` がその desc で止まり、それより前で段落を分割すると、
 *   後ろの段落の desc が 1 つずつずれて使われ、後ろの全段落の DOM が書き換えられる。
 *
 * この module は view の更新の後に、block の desc と文書の node を順に比べ、別の object で内容が
 * 等しいものだけ `desc.node` を新しい node へ付け替える。transaction を出さず、DOM・Selection・
 * history・dirty に触れない。`desc.node` は `eq` な node と入れ替えても PM の照合の結果が変わらない。
 *
 * PM の内部（`view.docView`、desc の `node` / `children` / `dirty` / `mark`）へ触れるのはこの module
 * だけにする。形が想定と違えば何もしない（性能だけの問題に倒す）。prosemirror-view の版が変わった
 * ときは `tests/editor-viewdesc-identity-perf1.test.ts` が落ちるので、そこで想定を確かめ直す。
 *
 * 対象は block の階層だけで、textblock の中（inline の desc）へは進まない。inline の desc は mark の
 * 入れ子・decoration による text の分割・composition 用の desc を含み、影響も 1 段落に限られる。
 */
import { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { EditorView } from '@tiptap/pm/view'

/** この module の想定を確かめた prosemirror-view の版。 */
export const VIEW_DESC_IDENTITY_VERIFIED_PROSEMIRROR_VIEW_VERSION = '1.41.9'

/** prosemirror-view の `NOT_DIRTY`。 */
const NOT_DIRTY = 0

export type ViewDescIdentityRepairResult = {
  /** `shape-mismatch`: `view.docView` の形が想定と違い、何もしなかった。 */
  status: 'repaired' | 'shape-mismatch'
  /** `desc.node` を付け替えた数。 */
  repointed: number
  /** 対応を証明できず、触れなかった desc / 階層の数（dirty、内容の不一致、数の不一致など）。 */
  skipped: number
}

type DescLike = {
  node?: unknown
  children?: unknown
  dirty?: unknown
  mark?: unknown
}

function isDescLike(value: unknown): value is DescLike {
  return typeof value === 'object' && value !== null
}

/** block を子に持つ node（textblock・leaf ではない）。 */
function hasBlockChildren(node: ProseMirrorNode): boolean {
  return !node.isLeaf && !node.inlineContent && node.childCount > 0
}

/**
 * `parentDesc.children` の node desc と `parentNode` の子を順に対応させ、別 object で内容の等しい
 * ものを付け替える。すべての子が「同じ object」または「付け替え済み」になったときだけ true。
 */
function repairChildren(
  parentDesc: DescLike,
  parentNode: ProseMirrorNode,
  result: ViewDescIdentityRepairResult,
): boolean {
  const children = parentDesc.children
  if (!Array.isArray(children)) {
    result.skipped += 1
    return false
  }

  // 1 巡目: 形の確認。node desc の数が子の数と一致し、mark の desc を含まないこと。
  // widget などの node を持たない desc は対応に数えない（`preMatch()` と同じ扱い）。
  let nodeDescCount = 0
  for (const child of children as unknown[]) {
    if (!isDescLike(child) || child.mark !== undefined) {
      result.skipped += 1
      return false
    }
    if (child.node instanceof ProseMirrorNode) nodeDescCount += 1
  }
  if (nodeDescCount !== parentNode.childCount) {
    result.skipped += 1
    return false
  }

  // 2 巡目: 同じ index の desc と node を比べる。
  let consistent = true
  let index = 0
  for (const child of children as DescLike[]) {
    const current = child.node
    if (!(current instanceof ProseMirrorNode)) continue
    const next = parentNode.child(index)
    index += 1
    if (child.dirty !== NOT_DIRTY) {
      // DOM の変更を読み取る前の desc。PM が次の更新で作り直すので触れない。
      result.skipped += 1
      consistent = false
      continue
    }
    if (current !== next) {
      if (!current.eq(next)) {
        result.skipped += 1
        consistent = false
        continue
      }
      child.node = next
      result.repointed += 1
    }
    if (hasBlockChildren(next) && !repairChildren(child, next, result)) {
      consistent = false
    }
  }
  return consistent
}

/**
 * view の更新の後に呼ぶ。block の desc の `node` を、現在の文書の node と同じ object にする。
 * 例外を投げない。
 */
export function repairViewDescNodeIdentity(view: EditorView): ViewDescIdentityRepairResult {
  const result: ViewDescIdentityRepairResult = { status: 'repaired', repointed: 0, skipped: 0 }
  try {
    const docView = (view as unknown as { docView?: unknown }).docView
    const doc = view.state.doc
    if (
      !isDescLike(docView) ||
      !(docView.node instanceof ProseMirrorNode) ||
      !Array.isArray(docView.children) ||
      typeof docView.dirty !== 'number'
    ) {
      result.status = 'shape-mismatch'
      return result
    }

    const rootNode = docView.node
    if (rootNode === doc) {
      repairChildren(docView, doc, result)
      return result
    }

    // 内容の等しい文書へ置き換わると、PM は view の更新そのものを省き、root の desc も古い文書を
    // 持ち続ける。子がすべて対応したときだけ root も付け替える（root の `eq` を別に取らない）。
    if (docView.dirty !== NOT_DIRTY || !rootNode.sameMarkup(doc)) {
      result.skipped += 1
      return result
    }
    if (repairChildren(docView, doc, result)) {
      docView.node = doc
      result.repointed += 1
    }
    return result
  } catch {
    result.status = 'shape-mismatch'
    return result
  }
}
