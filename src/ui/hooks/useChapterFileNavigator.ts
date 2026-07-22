import { useCallback } from 'react'
import { getPathBaseName } from '../utils/path'

/**
 * 章ファイルへ移動する共有ナビゲーション hook。
 *
 * Book全体Outline の章 / 見出しクリック（{@link BookOutlinePaneContainer}）と、
 * エディタ上部 toolbar の前後章ボタン（{@link ToolbarChapterNavContainer}）の両方が
 * 同一のナビゲーション flow を共有し、挙動が分岐しないようにする。
 *
 * 開き方は呼び出し側の click の `shiftKey` から決める:
 * - 通常クリック（`'same-tab'`）: `loadIntoActiveTab` で同じタブへ章ファイルを読み込む。
 *   細切れの章を「一つのファイルのように」順に行き来する執筆体験のための既定動作。
 * - Shift+クリック（`'new-tab'`）: `openFileInTab` で別タブに開く。
 *
 * 不変条件:
 * - どちらのモードも既存 `openFile` / `getFileStat` でファイル内容と stat を読み、
 *   `loadIntoActiveTab` / `openFileInTab` の既存 guard を必ず通す。
 *   dirty guard / save-before-close / Source Mode draft guard / paragraph-plain commit を迂回しない。
 * - tab limit / dirty guard cancel は `loadIntoActiveTab` / `openFileInTab` の判断を尊重し、強行しない。
 * - renderer から解決済み project root を渡さない（active file path だけを bridge に渡す）。
 * - read-only。対象ファイルを書き換えない。
 */

export type ChapterOpenMode = 'same-tab' | 'new-tab'

/**
 * 移動結果。
 * - `'navigated'`: 対象章が active document になった。同タブ読み込み（`loadIntoActiveTab` の
 *   `'loaded'`）、別タブ open（`openFileInTab` の `'added'`）、同ファイルが別タブに既に開いて
 *   いて切り替えた場合（`'activated-existing'`）をまとめて表す。これらはいずれも見出し jump 可能。
 * - `'cancelled'`: dirty guard / Source Mode guard でユーザーが中断した。移動しない。
 * - `'tab-limit'`: 別タブモードでタブ上限。`onTabLimit` 済みで、移動しない。
 * - `'failed'`: ファイル読み込みに失敗した。移動しない。
 */
export type ChapterNavigationResult = 'navigated' | 'cancelled' | 'tab-limit' | 'failed'

type LoadFileIntoTab = (
  filePath: string,
  title: string,
  content: string,
  savedStat: { mtimeMs: number; size: number } | null,
) => Promise<string | void>

type UseChapterFileNavigatorOptions = {
  /** 通常クリック: 同じタブへ章を読み込む（既存 active-tab 読込経路）。 */
  loadIntoActiveTab: LoadFileIntoTab
  /** Shift+クリック: 別タブで章を開く（既存 new-tab open 経路）。 */
  openFileInTab: LoadFileIntoTab
  flushImeCompositionSideEffects: (reason: string) => void
  onTabLimit: () => void
  /** 読み込み前の IME flush 理由タグ（呼び出し元を区別する）。 */
  flushReason: string
}

export function useChapterFileNavigator({
  loadIntoActiveTab,
  openFileInTab,
  flushImeCompositionSideEffects,
  onTabLimit,
  flushReason,
}: UseChapterFileNavigatorOptions) {
  return useCallback(
    async (
      absolutePath: string,
      openMode: ChapterOpenMode,
    ): Promise<ChapterNavigationResult> => {
      const openFile = window.nyozeBridge?.fs?.openFile
      if (!openFile) return 'failed'
      flushImeCompositionSideEffects(flushReason)
      const result = await openFile(absolutePath).catch(() => null)
      if (!result || !result.ok) return 'failed'
      const stat = await window.nyozeBridge?.fs?.getFileStat?.(absolutePath).catch(() => null)
      const saved = stat ? { mtimeMs: stat.mtimeMs, size: stat.size } : null
      const title = getPathBaseName(absolutePath)

      if (openMode === 'new-tab') {
        // Shift+クリック: 別タブで開く。tab 上限は openFileInTab の判断を尊重。
        const opened = await openFileInTab(absolutePath, title, result.content, saved)
        if (opened === 'tab-limit') {
          onTabLimit()
          return 'tab-limit'
        }
        if (opened === 'cancelled') return 'cancelled'
        // 'added'（新規タブ、または同ファイルの既存タブを activate）→ active doc は対象ファイル。
        return 'navigated'
      }

      // 通常クリック: 同じタブへ読み込む。別タブに同ファイルがあれば既存タブを activate する
      // （loadIntoActiveTab の既存挙動 'activated-existing' を尊重する）。
      const loaded = await loadIntoActiveTab(absolutePath, title, result.content, saved)
      if (loaded === 'cancelled') return 'cancelled'
      // 'loaded' / 'activated-existing' → active doc は対象ファイル。
      return 'navigated'
    },
    [loadIntoActiveTab, openFileInTab, flushImeCompositionSideEffects, onTabLimit, flushReason],
  )
}
