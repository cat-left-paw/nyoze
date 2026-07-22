import { getProjectRoleIcon, type ProjectIconRole } from './projectRoleIconMap'
import { PaneTablerIcon, type PaneTablerIconSize } from './PaneTablerIcon'

/**
 * Project / Book の role を表す軽量アイコンのコンポーネント（表示専用）。
 *
 * 目的は視認性向上のみで、クリック挙動・分類ロジック・scan には一切関与しない。
 * role -> icon の対応と非コンポーネント helper は {@link ./projectRoleIconMap} に集約する。
 */

export type { ProjectIconRole }

const DEFAULT_STROKE = 1.6

/**
 * role に対応する小さなアイコンを描画する。テキストラベルが意味を担うため、
 * アイコンは装飾扱い（`aria-hidden`）にしてスクリーンリーダーで二重読みを避ける。
 */
export function ProjectRoleIcon({
  role,
  size = 'sm',
  stroke = DEFAULT_STROKE,
}: {
  role: ProjectIconRole
  size?: PaneTablerIconSize
  stroke?: number
}) {
  const IconComponent = getProjectRoleIcon(role)
  return (
    <PaneTablerIcon
      icon={IconComponent}
      size={size}
      stroke={stroke}
      className="project-role-icon"
    />
  )
}
