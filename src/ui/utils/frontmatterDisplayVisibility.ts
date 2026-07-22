/**
 * frontmatter display の文脈対応（pure）。
 *
 * 背景: frontmatter `title` は「作品タイトル」ではなく、その Markdown ファイル自身の
 * 表示名（章タイトル・資料タイトル・人物名など）として扱う方針。Project 内では
 * frontmatter は管理 metadata であり、本文中に title / author / book / order / role を
 * そのまま出す価値は低い。一方、Project 外の単独文書では従来どおり title / author /
 * translator などを本文上部へ表示してよい。
 *
 * この helper は「frontmatter display を本文中に出すか」だけを決める。どのフィールドを
 * 出すか（authors / translators / role labels）は既存の FrontmatterView 側が担う。
 *
 * 設計判断:
 * - `frontmatterVisible` が false なら、Project 内外を問わず常に非表示（既存挙動）。
 * - Project 外（単独文書）では `frontmatterVisible` をそのまま尊重する（既存挙動維持）。
 * - Project 内では既定で非表示。`showInProjectFiles` が true のときだけ表示する。
 * - Project 所属が未確定（`membership.pending`）のときは、hook が保持している直前の
 *   `inProject` をそのまま使う。Project 内→Project 内の切替で単独文書表示へ跳ねない。
 * - resolve 完了後は `pending: false` となり、正しい Project / 単独文書ルールが適用される。
 */
export type FrontmatterProjectMembership = {
  inProject: boolean
  pending: boolean
}

export function resolveFrontmatterDisplayVisible(options: {
  /** Display Settings の「フロントマターを表示」(単独文書向け既存トグル)。 */
  frontmatterVisible: boolean
  /** Project 所属の解決状態。pending 中は hook が直前の inProject を保持している。 */
  membership: FrontmatterProjectMembership
  /** Display Settings の「Project内ファイルでも表示」(既定 false)。 */
  showInProjectFiles: boolean
}): boolean {
  const { frontmatterVisible, membership, showInProjectFiles } = options
  if (!frontmatterVisible) return false
  if (membership.inProject) return showInProjectFiles
  return true
}
