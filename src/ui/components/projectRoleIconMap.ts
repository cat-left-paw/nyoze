import {
  IconArchive,
  IconBook,
  IconBook2,
  IconFileText,
  IconInbox,
  IconMap,
  IconUsers,
  type Icon,
} from '@tabler/icons-react'
import type { ProjectAssetRole } from '../../project/projectBooksQuery'

/**
 * Project / Book の role -> アイコン対応（表示専用、非コンポーネント）。
 *
 * JSX を出さない純データ + helper をここに集約し、{@link ProjectRoleIcon} コンポーネント
 * とは別ファイルにすることで、Fast Refresh の component-only export 制約を満たしつつ、
 * 同じ対応表を ProjectPaneIconButton 等の `icon` prop でも再利用できるようにする。
 *
 * アイコン選定方針:
 * - `project`（作品 / project root）は {@link IconBook2}。
 * - `books`（Book セクション header）と `body`（本文ファイル単体）は {@link IconBook}。
 * - 左ペイン tab: 書庫 = {@link IconBooks}、作品 = {@link IconBook2}。
 * - `setting`（舞台設定）はアプリ設定と紛らわしいため歯車を避け、地図アイコンにする。
 * - `unsorted`（未整理）はエラーに見えないよう警告アイコンを避け、受信トレイにする。
 * - `note` は付箋 Notes と紛らわしく、Project タブ資料分類では表示対象外なので扱わない。
 */

/** アイコンを持つ role の種類。資料 role に加え、project root / Books / body を含む。 */
export type ProjectIconRole =
  | 'project' // 作品（project root）
  | 'books' // Book セクション（本文章のまとまり）
  | 'body' // 本文章ファイル単体
  | ProjectAssetRole // synopsis / character / setting / material / unsorted

const ROLE_ICON: Record<ProjectIconRole, Icon> = {
  project: IconBook2,
  books: IconBook,
  body: IconBook,
  synopsis: IconFileText,
  character: IconUsers,
  setting: IconMap,
  material: IconArchive,
  unsorted: IconInbox,
}

/**
 * role に対応する tabler Icon コンポーネントそのものを返す（表示専用）。
 *
 * `ProjectRoleIcon` を使えない箇所（例: {@link ProjectPaneIconButton} の `icon` prop に
 * 直接 Icon を渡す未登録ファイル登録ボタン）で、同じ role -> icon 対応を再利用するため。
 */
export function getProjectRoleIcon(role: ProjectIconRole): Icon {
  return ROLE_ICON[role]
}
