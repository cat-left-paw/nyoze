import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { PluginKey, type Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import {
  findRubyPunctuationRuns,
  findRubyPunctuationRunsInTextblocks,
  rubyPunctuationRunKey,
  sortAndDedupeRubyPunctuationRuns,
  type RubyPunctuationRun,
  type RubyPunctuationTextblockRange,
} from '../io/rubyPunctuationRun'

export const RUBY_PUNCT_RUN_WRAPPER_CLASS = 'tategaki-ruby-punct-run'
export const RUBY_PUNCT_BASE_CLASS = 'tategaki-ruby-punct-base'
export const RUBY_PUNCT_TAIL_CLASS = 'tategaki-ruby-punct-tail'

export const rubyPunctuationNowrapPluginKey =
  new PluginKey<RubyPunctuationNowrapPluginState>(
    'nyozeRubyPunctuationNowrap',
  )

export type RubyPunctuationNowrapInstrumentationEvent =
  | 'full-scan'
  | 'textblock-scan'
  | 'incremental-transition'
  | 'full-fallback'
  | 'sync-request'
  | 'sync-run'
  | 'node-dom-lookup'
  | 'wrap'
  | 'unwrap'
  | 'observer-pause'
  | 'registry-size'

export type RubyPunctuationNowrapInstrumentation = {
  onEvent?: (
    event: RubyPunctuationNowrapInstrumentationEvent,
    detail?: Record<string, number | string | boolean>,
  ) => void
}

export type RubyPunctuationDomPlan =
  | { kind: 'full' }
  | {
      kind: 'incremental'
      removedRunKeys: string[]
      addedRunKeys: string[]
      rekeyedRuns: Array<{ from: string; to: string }>
      replacementRunKeys: Array<{ from: string; to: string }>
      changedTextblocks: RubyPunctuationTextblockRange[]
    }

export type RubyPunctuationNowrapUpdateKind =
  | 'initial'
  | 'incremental'
  | 'full-fallback'

export type RubyPunctuationNowrapPluginState = {
  runs: RubyPunctuationRun[]
  runByKey: ReadonlyMap<string, RubyPunctuationRun>
  decorations: DecorationSet
  revision: number
  updateKind: RubyPunctuationNowrapUpdateKind
  changedTextblocks: RubyPunctuationTextblockRange[]
  domPlan: RubyPunctuationDomPlan
}

/**
 * PERF2b-2b0 — plugin apply 1 回分の実処理量。**固定 enum と件数だけ**で、
 * 本文・ルビ文字列・PM position・DOM は載せない。
 *
 * これは診断であって最適化ではない。この値のために scan / mapping /
 * DecorationSet 更新のアルゴリズムを変えてはいけない。
 */
export type RubyPunctuationNowrapApplyStats = {
  updateKind: RubyPunctuationNowrapUpdateKind
  /** incremental 判定で分析対象になった textblock range 数（full では 0）。 */
  textblocksAnalyzed: number
  /** 実際に scan 本体へ到達した textblock 数（full では full scan の訪問数）。 */
  textblocksScanned: number
  runsVisited: number
  runsMapped: number
  runsRekeyed: number
  runsRemoved: number
  runsRescanned: number
  decorationsRemoved: number
  decorationsAdded: number
}

/**
 * apply 1 回分の診断 sink。**capture OFF では factory が `null` を返す**ので、
 * counter も `performance.now()` も一切走らない。
 */
export type RubyPunctuationNowrapApplyDiagnostics = {
  /** `DecorationSet.map()` だけを囲む子 span。親は `ruby-punctuation`。 */
  beginDecorationMapSpan: () => (() => void) | null
  report: (stats: RubyPunctuationNowrapApplyStats) => void
}

/**
 * DOM sync を **要求した時点** の因果元 identity。
 * event 側に identity が無いと、遅れて走った sync が別 flush へ混入するため、
 * schedule 時に捕まえて実行時に完全一致だけを許す。
 */
export type RubyPunctuationDomSyncToken = {
  recordId: number
  generation: number
}

/** DOM sync 1 回分の件数。DOM node / position は含まない。 */
export type RubyPunctuationDomSyncCounts = {
  syncRuns: number
  nodeDomLookups: number
  wraps: number
  unwraps: number
  registrySize: number | null
}

/**
 * plugin view の DOM sync 診断 port。
 *
 * **pilot / capture が無効なら `readToken()` が `null` を返す**ので、
 * sync 本体の loop は counter を 1 つも触らず `report()` にも到達しない。
 */
export type RubyPunctuationDomSyncDiagnostics = {
  readToken: () => RubyPunctuationDomSyncToken | null
  report: (
    token: RubyPunctuationDomSyncToken,
    counts: RubyPunctuationDomSyncCounts,
  ) => void
}

export type RubyPunctuationChangedTextblockAnalysis =
  | {
      kind: 'incremental'
      textblocks: RubyPunctuationTextblockRange[]
    }
  | {
      kind: 'full-fallback'
      reason: string
    }

export function emitRubyPunctuationNowrapInstrumentation(
  instrumentation: RubyPunctuationNowrapInstrumentation | undefined,
  event: RubyPunctuationNowrapInstrumentationEvent,
  detail?: Record<string, number | string | boolean>,
): void {
  try {
    instrumentation?.onEvent?.(event, detail)
  } catch {
    // Test/diagnostic instrumentation must never affect editor input.
  }
  const globalHook = (
    globalThis as typeof globalThis & {
      __NYOZE_RUBY_PUNCTUATION_NOWRAP_TEST_HOOK__?: (
        event: RubyPunctuationNowrapInstrumentationEvent,
        detail?: Record<string, number | string | boolean>,
      ) => void
    }
  ).__NYOZE_RUBY_PUNCTUATION_NOWRAP_TEST_HOOK__
  try {
    globalHook?.(event, detail)
  } catch {
    // Runtime diagnostics are observational and fail closed.
  }
}

function decorationsForRuns(runs: readonly RubyPunctuationRun[]): Decoration[] {
  const decorations: Decoration[] = []
  for (const run of runs) {
    decorations.push(
      Decoration.node(run.rubyFrom, run.rubyTo, {
        class: RUBY_PUNCT_BASE_CLASS,
        'data-nyoze-ruby-punct': 'base',
      }),
      Decoration.inline(run.punctuationFrom, run.punctuationTo, {
        nodeName: 'span',
        class: RUBY_PUNCT_TAIL_CLASS,
        'data-nyoze-ruby-punct': 'tail',
      }),
    )
  }
  return decorations
}

function runMap(
  runs: readonly RubyPunctuationRun[],
): ReadonlyMap<string, RubyPunctuationRun> {
  return new Map(runs.map((run) => [rubyPunctuationRunKey(run), run]))
}

export function buildRubyPunctuationDecorations(
  doc: ProseMirrorNode,
): DecorationSet {
  const runs = findRubyPunctuationRuns(doc)
  return runs.length === 0
    ? DecorationSet.empty
    : DecorationSet.create(doc, decorationsForRuns(runs))
}

function textblockRangeAt(
  doc: ProseMirrorNode,
  pos: number,
): RubyPunctuationTextblockRange | null {
  const clamped = Math.max(0, Math.min(pos, doc.content.size))
  const $pos = doc.resolve(clamped)
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth)
    if (!node.isTextblock) continue
    const from = $pos.before(depth)
    return { from, to: from + node.nodeSize, nodeType: node.type.name }
  }
  return null
}

function singleChangedTextblock(
  doc: ProseMirrorNode,
  from: number,
  to: number,
): RubyPunctuationTextblockRange | null {
  const fromRange = textblockRangeAt(doc, from)
  const toRange = textblockRangeAt(doc, to)
  if (
    !fromRange ||
    !toRange ||
    fromRange.from !== toRange.from ||
    fromRange.to !== toRange.to
  ) {
    return null
  }
  const contentFrom = fromRange.from + 1
  const contentTo = fromRange.to - 1
  return from >= contentFrom && to <= contentTo ? fromRange : null
}

/**
 * transactionの各stepが同一textblock内に閉じている場合だけ、最終doc上の
 * 再探索範囲を返す。block split/join、全文置換、判定不能stepはfull scanへ送る。
 */
export function analyzeRubyPunctuationChangedTextblocks(
  tr: Transaction,
): RubyPunctuationChangedTextblockAnalysis {
  if (!tr.docChanged || tr.steps.length === 0) {
    return { kind: 'full-fallback', reason: 'missing-doc-change-steps' }
  }

  const finalRanges = new Map<number, RubyPunctuationTextblockRange>()
  for (let stepIndex = 0; stepIndex < tr.steps.length; stepIndex += 1) {
    const step = tr.steps[stepIndex]
    const oldDoc = tr.docs[stepIndex]
    const nextDoc =
      stepIndex + 1 < tr.docs.length ? tr.docs[stepIndex + 1] : tr.doc
    if (!oldDoc || !nextDoc) {
      return { kind: 'full-fallback', reason: 'missing-step-document' }
    }

    const segments: Array<{
      oldFrom: number
      oldTo: number
      newFrom: number
      newTo: number
    }> = []
    tr.mapping.maps[stepIndex].forEach(
      (oldFrom, oldTo, newFrom, newTo) => {
        segments.push({ oldFrom, oldTo, newFrom, newTo })
      },
    )

    if (segments.length === 0) {
      const json = step.toJSON() as {
        stepType?: string
        from?: number
        to?: number
      }
      if (
        (json.stepType === 'addMark' || json.stepType === 'removeMark') &&
        Number.isInteger(json.from) &&
        Number.isInteger(json.to)
      ) {
        segments.push({
          oldFrom: json.from as number,
          oldTo: json.to as number,
          newFrom: json.from as number,
          newTo: json.to as number,
        })
      } else {
        return {
          kind: 'full-fallback',
          reason: `unsupported-step:${json.stepType ?? 'unknown'}`,
        }
      }
    }

    for (const segment of segments) {
      const oldRange = singleChangedTextblock(
        oldDoc,
        segment.oldFrom,
        segment.oldTo,
      )
      const newRange = singleChangedTextblock(
        nextDoc,
        segment.newFrom,
        segment.newTo,
      )
      if (!oldRange || !newRange || oldRange.nodeType !== newRange.nodeType) {
        return {
          kind: 'full-fallback',
          reason: 'change-crosses-textblock-boundary',
        }
      }

      const remainingMapping = tr.mapping.slice(stepIndex + 1)
      const finalFrom = remainingMapping.map(segment.newFrom, 1)
      const finalTo = remainingMapping.map(segment.newTo, -1)
      const finalRange = singleChangedTextblock(tr.doc, finalFrom, finalTo)
      if (!finalRange || finalRange.nodeType !== newRange.nodeType) {
        return {
          kind: 'full-fallback',
          reason: 'changed-textblock-not-stable',
        }
      }
      finalRanges.set(finalRange.from, finalRange)
    }
  }

  if (finalRanges.size === 0) {
    return { kind: 'full-fallback', reason: 'no-local-ranges' }
  }
  return {
    kind: 'incremental',
    textblocks: [...finalRanges.values()].sort(
      (left, right) => left.from - right.from,
    ),
  }
}

function runOverlapsTextblocks(
  run: RubyPunctuationRun,
  ranges: readonly RubyPunctuationTextblockRange[],
): boolean {
  return ranges.some(
    (range) => run.rubyFrom < range.to && run.punctuationTo > range.from,
  )
}

function mapRubyPunctuationRun(
  run: RubyPunctuationRun,
  tr: Transaction,
): RubyPunctuationRun | null {
  const rubyFrom = tr.mapping.map(run.rubyFrom, 1)
  const rubyTo = tr.mapping.map(run.rubyTo, -1)
  const punctuationFrom = tr.mapping.map(run.punctuationFrom, 1)
  const punctuationTo = tr.mapping.map(run.punctuationTo, -1)
  if (
    rubyFrom < 0 ||
    rubyFrom >= rubyTo ||
    rubyTo > punctuationFrom ||
    punctuationFrom >= punctuationTo ||
    punctuationTo > tr.doc.content.size
  ) {
    return null
  }
  return {
    ...run,
    rubyFrom,
    rubyTo,
    punctuationFrom,
    punctuationTo,
  }
}

/**
 * 診断 sink の失敗を plugin apply / PM transaction へ波及させない。
 * **呼び出し側で `diagnostics` の有無を分岐すること**（capture OFF では stats
 * object literal すら組み立てない）。
 */
function reportApplyStats(
  diagnostics: RubyPunctuationNowrapApplyDiagnostics,
  stats: RubyPunctuationNowrapApplyStats,
): void {
  try {
    diagnostics.report(stats)
  } catch {
    // Diagnostics are observational and fail closed.
  }
}

/**
 * `DecorationSet.map()` だけを子 span で囲む。
 * span の取得・終了の例外は隔離するが、`run()` 自身の例外意味論は変えない。
 */
function measureDecorationSetMap<T>(
  diagnostics: RubyPunctuationNowrapApplyDiagnostics,
  run: () => T,
): T {
  let end: (() => void) | null = null
  try {
    end = diagnostics.beginDecorationMapSpan()
  } catch {
    end = null
  }
  try {
    return run()
  } finally {
    try {
      end?.()
    } catch {
      // diagnostic only
    }
  }
}

function fullPluginState(
  doc: ProseMirrorNode,
  revision: number,
  updateKind: 'initial' | 'full-fallback',
  instrumentation?: RubyPunctuationNowrapInstrumentation,
  diagnostics?: RubyPunctuationNowrapApplyDiagnostics,
): RubyPunctuationNowrapPluginState {
  emitRubyPunctuationNowrapInstrumentation(instrumentation, 'full-scan', {
    updateKind,
  })
  if (updateKind === 'full-fallback') {
    emitRubyPunctuationNowrapInstrumentation(
      instrumentation,
      'full-fallback',
    )
  }
  // full scan の textblock 数は、既存 traversal 中の訪問カウントだけで得る
  // （診断のための 2 周目の走査を絶対に足さない）。
  let textblocksScanned = 0
  const runs = findRubyPunctuationRuns(
    doc,
    diagnostics
      ? () => {
          textblocksScanned += 1
        }
      : undefined,
  )
  const addedDecorations = runs.length === 0 ? [] : decorationsForRuns(runs)
  if (diagnostics) {
    reportApplyStats(diagnostics, {
      updateKind,
      textblocksAnalyzed: 0,
      textblocksScanned,
      runsVisited: 0,
      runsMapped: 0,
      runsRekeyed: 0,
      runsRemoved: 0,
      runsRescanned: runs.length,
      decorationsRemoved: 0,
      decorationsAdded: addedDecorations.length,
    })
  }
  return {
    runs,
    runByKey: runMap(runs),
    decorations:
      addedDecorations.length === 0
        ? DecorationSet.empty
        : DecorationSet.create(doc, addedDecorations),
    revision,
    updateKind,
    changedTextblocks: [],
    domPlan: { kind: 'full' },
  }
}

export function createInitialRubyPunctuationNowrapState(
  doc: ProseMirrorNode,
  instrumentation?: RubyPunctuationNowrapInstrumentation,
): RubyPunctuationNowrapPluginState {
  // `initial` は通常確定 flush の統計へ混ぜない（診断 sink を渡さない）。
  return fullPluginState(doc, 0, 'initial', instrumentation)
}

export function applyRubyPunctuationNowrapTransaction(
  tr: Transaction,
  previous: RubyPunctuationNowrapPluginState,
  instrumentation?: RubyPunctuationNowrapInstrumentation,
  diagnostics?: RubyPunctuationNowrapApplyDiagnostics,
): RubyPunctuationNowrapPluginState {
  if (!tr.docChanged) return previous

  const analysis = analyzeRubyPunctuationChangedTextblocks(tr)
  if (analysis.kind === 'full-fallback') {
    return fullPluginState(
      tr.doc,
      previous.revision + 1,
      'full-fallback',
      instrumentation,
      diagnostics,
    )
  }

  emitRubyPunctuationNowrapInstrumentation(
    instrumentation,
    'incremental-transition',
    { textblocks: analysis.textblocks.length },
  )
  const removedRunKeys: string[] = []
  const rekeyedRuns: Array<{ from: string; to: string }> = []
  const affectedRunPositions: Array<{ key: string; mappedRubyFrom: number }> = []
  const unaffectedRuns: RubyPunctuationRun[] = []
  // 診断用の件数。**hot path（未変更 run の走査）には一切足さない**。
  // `runsVisited` は loop が `previous.runs` を無条件に全走査するので長さから導出し、
  // `runsMapped` は稀にしか通らない「除外された run」の分岐でだけ差分を数える。
  let unmappedRuns = 0
  let textblocksScanned = 0
  for (const run of previous.runs) {
    const oldKey = rubyPunctuationRunKey(run)
    const mapped = mapRubyPunctuationRun(run, tr)
    if (!mapped || runOverlapsTextblocks(mapped, analysis.textblocks)) {
      if (diagnostics && !mapped) unmappedRuns += 1
      removedRunKeys.push(oldKey)
      affectedRunPositions.push({
        key: oldKey,
        mappedRubyFrom: tr.mapping.map(run.rubyFrom, 1),
      })
      continue
    }
    unaffectedRuns.push(mapped)
    const newKey = rubyPunctuationRunKey(mapped)
    if (oldKey !== newKey) rekeyedRuns.push({ from: oldKey, to: newKey })
  }

  const rescannedRuns = findRubyPunctuationRunsInTextblocks(
    tr.doc,
    analysis.textblocks,
    (range) => {
      if (diagnostics) textblocksScanned += 1
      emitRubyPunctuationNowrapInstrumentation(
        instrumentation,
        'textblock-scan',
        { from: range.from, to: range.to },
      )
    },
  )
  const runs = sortAndDedupeRubyPunctuationRuns([
    ...unaffectedRuns,
    ...rescannedRuns,
  ])
  const rescannedRunByRubyFrom = new Map(
    rescannedRuns.map((run) => [run.rubyFrom, run]),
  )
  const replacementRunKeys = affectedRunPositions.flatMap((affected) => {
    const replacement = rescannedRunByRubyFrom.get(affected.mappedRubyFrom)
    return replacement
      ? [
          {
            from: affected.key,
            to: rubyPunctuationRunKey(replacement),
          },
        ]
      : []
  })

  // capture OFF では closure も try/finally も経由せず、従来どおり直接呼ぶ。
  let decorations = diagnostics
    ? measureDecorationSetMap(diagnostics, () =>
        previous.decorations.map(tr.mapping, tr.doc),
      )
    : previous.decorations.map(tr.mapping, tr.doc)
  const decorationsToRemove = analysis.textblocks.flatMap((range) =>
    decorations.find(range.from, range.to),
  )
  if (decorationsToRemove.length > 0) {
    decorations = decorations.remove(decorationsToRemove)
  }
  const addedDecorations = decorationsForRuns(rescannedRuns)
  if (addedDecorations.length > 0) {
    decorations = decorations.add(tr.doc, addedDecorations)
  }

  if (diagnostics) {
    reportApplyStats(diagnostics, {
      updateKind: 'incremental',
      textblocksAnalyzed: analysis.textblocks.length,
      textblocksScanned,
      runsVisited: previous.runs.length,
      runsMapped: previous.runs.length - unmappedRuns,
      runsRekeyed: rekeyedRuns.length,
      runsRemoved: removedRunKeys.length,
      runsRescanned: rescannedRuns.length,
      decorationsRemoved: decorationsToRemove.length,
      decorationsAdded: addedDecorations.length,
    })
  }

  return {
    runs,
    runByKey: runMap(runs),
    decorations,
    revision: previous.revision + 1,
    updateKind: 'incremental',
    changedTextblocks: analysis.textblocks,
    domPlan: {
      kind: 'incremental',
      removedRunKeys,
      addedRunKeys: rescannedRuns.map(rubyPunctuationRunKey),
      rekeyedRuns,
      replacementRunKeys,
      changedTextblocks: analysis.textblocks,
    },
  }
}
