import { useEffect, type RefObject } from 'react'
import type { EditorCoreHandle } from '../../editor-core/types'
import { headingFontScaleToRatio } from '../../settings/headingFontScale'

/**
 * EDITOR-HEADING-FONT-SCALE1: 見出しの文字サイズの倍率（本文比 %）を、`documentElement` の
 * `--editor-heading-scale`（倍率。100% → 1）へ写す。
 *
 * この値は editor の root へ継承される。deps は倍率 1 つだけなので、設定の倍率が変わったときにだけ書き、
 * resize・frame・別の設定の変更では書かない（`tests/editor-heading-font-scale1.test.ts` が deps を固定し、
 * `tests/e2e/editor-heading-font-scale1.spec.ts` が書き込みの回数を見る）。倍率を掛ける見出しの
 * `font-size` は `styles.css`、ページビューアと Web Book は別の変数（`--pv-heading-scale` /
 * `--wb-heading-font-scale`）を使う。
 */
export function useEditorHeadingScaleVariable(headingFontScale: number, coreRef: RefObject<EditorCoreHandle | null>): void {
  useEffect(() => {
    document.documentElement.style.setProperty('--editor-heading-scale', `${headingFontScaleToRatio(headingFontScale)}`)
    coreRef.current?.refreshInputSurfaceDisplay()
  }, [headingFontScale, coreRef])
}
