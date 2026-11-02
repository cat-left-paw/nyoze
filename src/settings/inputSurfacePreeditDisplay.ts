import { DEFAULT_EXPERIMENTAL_INPUT_SURFACE_PREEDIT_DISPLAY } from './defaults'
import type { ExperimentalInputSurfacePreeditDisplay } from './types'

/**
 * PIS-S10-PREEDIT-DISPLAY1: 変換中の文字の表示の設定値を読む。
 * `'overlay'`のときだけ`'overlay'`。それ以外（未設定・null・数値・別の文字列・object）は既定の`'inline'`。
 * mainのsanitizerとrendererの読み込みの両方がこの関数を使う。
 */
export function normalizeExperimentalInputSurfacePreeditDisplay(
  value: unknown,
): ExperimentalInputSurfacePreeditDisplay {
  return value === 'overlay' ? 'overlay' : DEFAULT_EXPERIMENTAL_INPUT_SURFACE_PREEDIT_DISPLAY
}
