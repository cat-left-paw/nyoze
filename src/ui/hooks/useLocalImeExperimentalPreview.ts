/**
 * 入力方式の設定の入口。製品の互換設定と、開発用Local Windowの旧設定を方式ごとのadapterへ渡す。
 *
 * PIS-S10-ENTRY1a: 入口の枠（設定UIへ渡すview）は1つで、中身は製品の入口の方式ごとのadapterが持つ。
 * - `input-surface`: Persistent Input Surface（`useInputSurfaceProductEntry`）。
 * - `local-window`: 非packagedの開発用の指定で戻したLocal Window（`useLocalWindowProductEntry`）。
 * 方式はmainの固定値（`electron/inputStrategyGate.ts`）で、起動のあいだ変わらない。
 * 製品の入口がない起動（利用できないplatform、作者Pilot）は、どちらのadapterも設定UIを出さない。
 */

import { useClassicInputSetting } from './useClassicInputSetting'
import { readInputStrategyCapability } from '../../editor-core/features/inputSurface/inputPathRuntime'
import type { LocalImeExperimentalPreviewView, ProductEntryOptions } from './localImeExperimentalPreviewView'
import { useInputSurfaceProductEntry } from './useInputSurfaceProductEntry'
import { useLocalWindowProductEntry } from './useLocalWindowProductEntry'

export {
  LOCAL_IME_EXPERIMENTAL_PREVIEW_DISABLE_REASON,
  type LocalImeExperimentalPreviewNoticeKind,
  type LocalImeExperimentalPreviewView,
  type ProductEntryOptions,
} from './localImeExperimentalPreviewView'

// 方式は起動のあいだ変わらないので、呼ぶhookも変わらない（hookの順序は安定）。
const useProductEntryAdapter = () =>
  readInputStrategyCapability().productStrategy === 'local-window'
    ? useLocalWindowProductEntry
    : useInputSurfaceProductEntry

export function useLocalImeExperimentalPreview(options: ProductEntryOptions): LocalImeExperimentalPreviewView {
  const classicInput = useClassicInputSetting()
  const productInput = readInputStrategyCapability().productStrategy === 'input-surface'
  return useProductEntryAdapter()({
    ...options,
    preferenceEnabled: productInput ? !classicInput.classicInputEnabled : options.preferenceEnabled,
    setPreferenceEnabled: productInput ? classicInput.setInputSurfaceEnabled : options.setPreferenceEnabled,
  })
}
