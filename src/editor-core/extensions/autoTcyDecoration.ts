import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import {
  resolveAutoTcyDigitRange,
  resolveAutoTcyNumbersOnly,
  type AutoTcyDigitRange,
} from '../features/autoTcy'
import {
  applyAutoTcyDecorationTransaction,
  buildAutoTcyDecorationState,
  sameAutoTcyDecorationConfig,
  type AutoTcyDecorationConfig,
  type AutoTcyDecorationState,
} from '../features/autoTcyDecorationState'

export { buildAutoTcyDecorations } from '../features/autoTcyDecorationState'

export interface AutoTcyDecorationOptions {
  isEnabled: () => boolean
  getDigitRange: () => AutoTcyDigitRange
  getNumbersOnly?: () => boolean
  /** PERF1: active local-IME flush中だけspanを開始する。 */
  beginPerfSpan?: () => (() => void) | null
}

export const autoTcyDecorationPluginKey = new PluginKey<AutoTcyDecorationState>('nyozeAutoTcyDecoration')

export function createAutoTcyDecorationPlugin(
  options: AutoTcyDecorationOptions,
): Plugin<AutoTcyDecorationState> {
  // getter設定はDocを変えずに更新される。propの最新projectionを次のapplyの基点に使う。
  // PMのplugin state自体は変更せず、最後に参照したDocの結果だけを保持する。
  let cached: AutoTcyDecorationState | null = null
  const readConfig = (): AutoTcyDecorationConfig => ({
    ...options.getDigitRange(),
    enabled: options.isEnabled(),
    numbersOnly: resolveAutoTcyNumbersOnly({ numbersOnly: options.getNumbersOnly?.() ?? false }),
  })
  const measure = (config: AutoTcyDecorationConfig, build: () => AutoTcyDecorationState) => {
    let end: (() => void) | null = null
    try { if (config.enabled) end = options.beginPerfSpan?.() ?? null } catch { /* diagnostic only */ }
    try { return build() } finally { try { end?.() } catch { /* diagnostic only */ } }
  }

  return new Plugin<AutoTcyDecorationState>({
    key: autoTcyDecorationPluginKey,
    state: {
      init(_config, state) {
        const config = readConfig()
        cached = measure(config, () => buildAutoTcyDecorationState(state.doc, config))
        return cached
      },
      apply(tr, previous) {
        const config = readConfig()
        if (!tr.docChanged && previous.doc === tr.doc && sameAutoTcyDecorationConfig(previous.config, config)) return previous
        const baseline = previous.doc === tr.before && cached?.doc === tr.before && sameAutoTcyDecorationConfig(cached.config, config) ? cached : previous
        cached = measure(config, () => applyAutoTcyDecorationTransaction(baseline, tr, config))
        return cached
      },
    },
    props: {
      decorations(state) {
        const config = readConfig()
        if (cached?.doc !== state.doc || !sameAutoTcyDecorationConfig(cached.config, config)) {
          const stored = autoTcyDecorationPluginKey.getState(state)
          cached = stored?.doc === state.doc && sameAutoTcyDecorationConfig(stored.config, config)
            ? stored : measure(config, () => buildAutoTcyDecorationState(state.doc, config))
        }
        return config.enabled ? cached.decorations : null
      },
    },
  })
}

export const AutoTcyDecoration = Extension.create<AutoTcyDecorationOptions>({
  name: 'autoTcyDecoration',

  addOptions() {
    return {
      isEnabled: () => false,
      getDigitRange: () => resolveAutoTcyDigitRange(),
      getNumbersOnly: () => false,
      beginPerfSpan: () => null,
    }
  },

  addProseMirrorPlugins() {
    return [createAutoTcyDecorationPlugin(this.options)]
  },
})
