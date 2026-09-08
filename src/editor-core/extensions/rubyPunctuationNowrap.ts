import { Extension } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import { createRubyPunctuationWrapperController } from './rubyPunctuationNowrapDom'
import {
  applyRubyPunctuationNowrapTransaction,
  createInitialRubyPunctuationNowrapState,
  rubyPunctuationNowrapPluginKey,
  type RubyPunctuationDomSyncDiagnostics,
  type RubyPunctuationNowrapApplyDiagnostics,
  type RubyPunctuationNowrapInstrumentation,
  type RubyPunctuationNowrapPluginState,
} from './rubyPunctuationNowrapState'

export {
  analyzeRubyPunctuationChangedTextblocks,
  applyRubyPunctuationNowrapTransaction,
  buildRubyPunctuationDecorations,
  createInitialRubyPunctuationNowrapState,
  emitRubyPunctuationNowrapInstrumentation,
  RUBY_PUNCT_BASE_CLASS,
  RUBY_PUNCT_RUN_WRAPPER_CLASS,
  RUBY_PUNCT_TAIL_CLASS,
  rubyPunctuationNowrapPluginKey,
  type RubyPunctuationChangedTextblockAnalysis,
  type RubyPunctuationDomPlan,
  type RubyPunctuationDomSyncCounts,
  type RubyPunctuationDomSyncDiagnostics,
  type RubyPunctuationDomSyncToken,
  type RubyPunctuationNowrapApplyDiagnostics,
  type RubyPunctuationNowrapApplyStats,
  type RubyPunctuationNowrapInstrumentation,
  type RubyPunctuationNowrapInstrumentationEvent,
  type RubyPunctuationNowrapPluginState,
  type RubyPunctuationNowrapUpdateKind,
} from './rubyPunctuationNowrapState'
export {
  classifyRubyPunctuationWrapperDisposition,
  createCoalescedRubyPunctuationSyncScheduler,
  createRubyPunctuationDomSyncTokenTracker,
  runRubyPunctuationDisplaySyncSafely,
  RUBY_PUNCT_RUN_WRAPPER_ATTRIBUTE,
  type RubyPunctuationWrapperDisposition,
} from './rubyPunctuationNowrapDom'

export function createRubyPunctuationNowrapPlugin(
  options: {
    instrumentation?: RubyPunctuationNowrapInstrumentation
    /** 親 span（`ruby-punctuation`）。plugin apply 全体を囲む。 */
    beginPerfSpan?: () => (() => void) | null
    /**
     * PERF2b-2b0 診断 sink の factory。capture OFF では `null` を返すこと。
     * `null` のときは件数も clock も一切取らない。
     */
    beginApplyDiagnostics?: () => RubyPunctuationNowrapApplyDiagnostics | null
    /**
     * plugin view の DOM sync 診断 port。未指定なら token tracker も作らない。
     * port 設定済みで capture OFF の場合は `readToken()` が `null` を返し、
     * sync 内の counter・report・clockを動かさない。
     */
    domSyncDiagnostics?: RubyPunctuationDomSyncDiagnostics
  } = {},
): Plugin<RubyPunctuationNowrapPluginState> {
  const instrumentation = options.instrumentation
  return new Plugin<RubyPunctuationNowrapPluginState>({
    key: rubyPunctuationNowrapPluginKey,
    state: {
      init: (_config, state) =>
        createInitialRubyPunctuationNowrapState(state.doc, instrumentation),
      apply: (tr, previous) => {
        let endPerfSpan: (() => void) | null = null
        try {
          endPerfSpan = options.beginPerfSpan?.() ?? null
        } catch {
          endPerfSpan = null
        }
        let diagnostics: RubyPunctuationNowrapApplyDiagnostics | undefined
        try {
          diagnostics = options.beginApplyDiagnostics?.() ?? undefined
        } catch {
          diagnostics = undefined
        }
        try {
          return applyRubyPunctuationNowrapTransaction(
            tr,
            previous,
            instrumentation,
            diagnostics,
          )
        } finally {
          try {
            endPerfSpan?.()
          } catch {
            // diagnostic only
          }
        }
      },
    },
    props: {
      decorations(state) {
        return rubyPunctuationNowrapPluginKey.getState(state)?.decorations
      },
    },
    view(view) {
      return createRubyPunctuationWrapperController(
        view,
        instrumentation,
        options.domSyncDiagnostics,
      )
    },
  })
}

export const RubyPunctuationNowrap = Extension.create<{
  instrumentation?: RubyPunctuationNowrapInstrumentation
  beginPerfSpan?: () => (() => void) | null
  beginApplyDiagnostics?: () => RubyPunctuationNowrapApplyDiagnostics | null
  domSyncDiagnostics?: RubyPunctuationDomSyncDiagnostics
}>({
  name: 'rubyPunctuationNowrap',

  addOptions() {
    return {
      instrumentation: undefined,
      beginPerfSpan: () => null,
      beginApplyDiagnostics: () => null,
      domSyncDiagnostics: undefined,
    }
  },

  addProseMirrorPlugins() {
    return [createRubyPunctuationNowrapPlugin(this.options)]
  },
})
