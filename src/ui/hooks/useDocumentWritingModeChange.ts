import { useCallback } from 'react'
import type { EditorCoreHandle } from '../../editor-core/types'
import {
  parseFrontmatterFields,
  splitLeadingFrontmatter,
} from '../../editor-core/io/frontmatter'
import {
  canSafelyPatchFrontmatter,
  patchFrontmatterKnownScalars,
} from '../../editor-core/io/frontmatterDocumentSettings'
import { countBodyCharacters } from '../utils/countBodyCharacters'
import type { WritingMode } from '../../settings/types'
import type { ActiveTabPatch } from './useAppUiState'

/** `useDocumentWritingModeChange` が参照する `useAppUiState` の最小サブセット。 */
type DocumentWritingModeChangeUi = {
  activeTab: { internalDocId?: string }
  fullPlainEditActive: boolean
  paragraphPlainModeActive: boolean
  patchActiveTab: (patch: ActiveTabPatch) => void
  recalcDirtyFromCore: () => void
}

/**
 * 文書単位の表示方向（frontmatter `writingMode`）を明示保存 / 削除する handler。
 * 本文・改行ポリシーには影響しない frontmatter-only 更新。
 * - 有効値は `vertical-rl` / `horizontal-tb`、`null` で key 削除。
 * - unsafe frontmatter（complex / duplicate 等）では何もしない（呼び出し側で UI を無効化）。
 * - 保存 / 削除後はタブの手動切替を解除し、保存した文書指定 / 既定方向を実効表示へ反映する。
 */
export function useDocumentWritingModeChange(
  coreRef: { current: EditorCoreHandle | null },
  ui: DocumentWritingModeChangeUi,
) {
  return useCallback(
    (next: WritingMode | null) => {
      if (ui.activeTab.internalDocId) return
      if (ui.fullPlainEditActive) return
      if (ui.paragraphPlainModeActive) return

      const core = coreRef.current
      if (!core) return

      const currentMarkdown = core.peekMarkdown()
      const split = splitLeadingFrontmatter(currentMarkdown)
      const hasMalformedLeadingFence =
        /^---[ \t]*(?:\r\n|\n|\r)/.test(currentMarkdown) && !split.hasFrontmatter
      if (
        hasMalformedLeadingFence ||
        !canSafelyPatchFrontmatter(split.frontmatterPrefix)
      ) {
        return
      }

      const nextFrontmatterPrefix = patchFrontmatterKnownScalars(
        split.frontmatterPrefix,
        { writingMode: next },
      )
      if (nextFrontmatterPrefix === split.frontmatterPrefix) {
        // frontmatter は変わらないが、保存済み文書指定 / 既定方向が見えるよう手動切替を解除する。
        ui.patchActiveTab({ writingModeFollowsTypeRecommendation: true })
        return
      }

      core.setFrontmatterPrefix(nextFrontmatterPrefix)
      const nextMarkdown = core.saveMarkdown()
      ui.patchActiveTab({
        frontmatterFields: parseFrontmatterFields(nextFrontmatterPrefix),
        markdownSnapshot: nextMarkdown,
        characterCount: countBodyCharacters(nextMarkdown),
        // 保存した文書指定 / 削除後の既定方向が実効表示へ反映されるよう手動切替を解除する。
        writingModeFollowsTypeRecommendation: true,
      })
      ui.recalcDirtyFromCore()
    },
    [coreRef, ui],
  )
}
