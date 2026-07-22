import { isSamePath } from './path'

/**
 * Project タブ右ペインで資料の簡易編集を開始してよいかを判定する pure helper。
 *
 * 二重編集 surface を禁止するため、次をすべて満たすときだけ true:
 * - write 可能な context（active-file context）である
 * - preview で資料が選択されている（path が非 null）
 * - 選択資料が中央エディタの active tab と同一ファイルではない
 *
 * 中央で開いている資料を右ペインでも編集できると、中央側の dirty / 保存 /
 * 外部変更検知と競合するため、その場合は編集を許可しない。
 * path 比較は separator / case 差を吸収する {@link isSamePath} に委譲する
 * （renderer で filesystem realpath は取得しない）。
 */
export function canEditProjectAssetInPane(input: {
  contextWriteCapable: boolean
  selectedAssetPath: string | null
  activeFilePath: string | null
}): boolean {
  if (!input.contextWriteCapable) return false
  if (!input.selectedAssetPath) return false
  if (isSamePath(input.selectedAssetPath, input.activeFilePath)) return false
  return true
}
