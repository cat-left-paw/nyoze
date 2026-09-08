import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { EditorState } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import {
  rubyPunctuationRunKey,
  type RubyPunctuationRun,
} from '../io/rubyPunctuationRun'
import {
  emitRubyPunctuationNowrapInstrumentation,
  RUBY_PUNCT_RUN_WRAPPER_CLASS,
  RUBY_PUNCT_TAIL_CLASS,
  rubyPunctuationNowrapPluginKey,
  type RubyPunctuationDomSyncDiagnostics,
  type RubyPunctuationDomSyncToken,
  type RubyPunctuationNowrapInstrumentation,
  type RubyPunctuationNowrapPluginState,
} from './rubyPunctuationNowrapState'

/**
 * 表示専用 run wrapper の識別属性。`RUBY_PUNCT_RUN_WRAPPER_CLASS` と対で
 * 「この span は display-only wrapper である」ことの単一の正本にする。
 */
export const RUBY_PUNCT_RUN_WRAPPER_ATTRIBUTE = 'data-nyoze-ruby-punct-run'
const RUN_WRAPPER_FLAG = RUBY_PUNCT_RUN_WRAPPER_ATTRIBUTE

type DomObserverControl = {
  stop?: () => void
  start?: () => void
}

type WrapperRecord = {
  key: string
  base: HTMLElement
  wrapper: HTMLElement
}

type WrapCandidate = {
  base: HTMLElement
  nodes: ChildNode[]
}

type CoalescedSyncScheduler = {
  request: () => void
  destroy: () => void
}

export type RubyPunctuationWrapperDisposition =
  | 'wrapper-eligible'
  | 'suppressed-later-special-inline'

/**
 * RUBYPUNCT-COEXIST1 — Ruby punctuation run の外側表示 wrapper だけを
 * 抑止するかを PM document から判定する。
 *
 * `findRubyPunctuationRuns()` が検出した run を入力とし、第二の約物検出器は
 * 持たない。run の exact position / textblock を再証明できない場合は、対象
 * pattern と推測せず従来の wrapper 表示を維持する。
 */
export function classifyRubyPunctuationWrapperDisposition(
  doc: ProseMirrorNode,
  run: RubyPunctuationRun,
): RubyPunctuationWrapperDisposition {
  try {
    const ruby = doc.nodeAt(run.rubyFrom)
    if (
      !ruby ||
      ruby.type.name !== 'aozoraRuby' ||
      run.rubyTo !== run.rubyFrom + ruby.nodeSize ||
      run.punctuationFrom !== run.rubyTo ||
      run.punctuationTo <= run.punctuationFrom ||
      doc.textBetween(run.punctuationFrom, run.punctuationTo) !==
        run.punctuationChar
    ) {
      return 'wrapper-eligible'
    }

    const $ruby = doc.resolve(run.rubyFrom)
    const $punctuationEnd = doc.resolve(run.punctuationTo)
    const textblock = $ruby.parent
    if (
      !textblock.isTextblock ||
      $punctuationEnd.parent !== textblock
    ) {
      return 'wrapper-eligible'
    }

    const textblockFrom = $ruby.start($ruby.depth)
    const textblockTo = $ruby.end($ruby.depth)
    if (
      run.rubyFrom < textblockFrom ||
      run.punctuationTo > textblockTo
    ) {
      return 'wrapper-eligible'
    }

    let exactRubyFound = false
    let laterSpecialInlineFound = false
    textblock.forEach((node, offset) => {
      const nodeFrom = textblockFrom + offset
      if (nodeFrom === run.rubyFrom && node === ruby) {
        exactRubyFound = true
      }
      if (
        nodeFrom >= run.punctuationTo &&
        (node.type.name === 'aozoraRuby' || node.type.name === 'aozoraTcy')
      ) {
        laterSpecialInlineFound = true
      }
    })

    return exactRubyFound && laterSpecialInlineFound
      ? 'suppressed-later-special-inline'
      : 'wrapper-eligible'
  } catch {
    // Malformed / stale position is not evidence for the limited coexistence pattern.
    return 'wrapper-eligible'
  }
}

function findRunsTouchingRange(
  runs: readonly RubyPunctuationRun[],
  from: number,
  to: number,
): RubyPunctuationRun[] {
  let low = 0
  let high = runs.length
  while (low < high) {
    const middle = (low + high) >> 1
    if (runs[middle].punctuationTo < from) low = middle + 1
    else high = middle
  }
  const matches: RubyPunctuationRun[] = []
  for (let index = low; index < runs.length; index += 1) {
    const run = runs[index]
    if (run.rubyFrom > to) break
    if (from <= run.punctuationTo && to >= run.rubyFrom) matches.push(run)
  }
  return matches
}

function selectionRunKeys(
  state: EditorState,
  pluginState: RubyPunctuationNowrapPluginState,
): Set<string> {
  const { from, to } = state.selection
  return new Set(
    findRunsTouchingRange(pluginState.runs, from, to).map(
      rubyPunctuationRunKey,
    ),
  )
}

function closestElement(node: Node | null): Element | null {
  if (!node) return null
  return node.nodeType === Node.ELEMENT_NODE
    ? (node as Element)
    : node.parentElement
}

function compositionBoundaryRunKeys(
  view: EditorView,
  event: Event,
  pluginState: RubyPunctuationNowrapPluginState,
): Set<string> {
  const positions = new Set<number>()
  const addBoundaryPosition = (element: Element | null) => {
    const sentinel = element?.closest<HTMLElement>(
      '[data-nyoze-special-inline-boundary="after"]',
    )
    const pos = Number(sentinel?.dataset.nyozeSpecialInlineBoundaryPos)
    if (Number.isInteger(pos)) positions.add(pos)
  }
  addBoundaryPosition(
    closestElement(event.target instanceof Node ? event.target : null),
  )
  const root = view.root as Document | ShadowRoot
  const domSelection =
    'getSelection' in root
      ? root.getSelection()
      : view.dom.ownerDocument.getSelection()
  addBoundaryPosition(closestElement(domSelection?.anchorNode ?? null))

  const keys = new Set<string>()
  for (const pos of positions) {
    for (const run of findRunsTouchingRange(pluginState.runs, pos, pos)) {
      keys.add(rubyPunctuationRunKey(run))
    }
  }
  return keys
}

function isRunWrapper(node: Node | null): node is HTMLElement {
  return node instanceof HTMLElement && node.hasAttribute(RUN_WRAPPER_FLAG)
}

function unwrapRun(wrapper: HTMLElement): boolean {
  const parent = wrapper.parentNode
  if (!parent) return false
  while (wrapper.firstChild) {
    parent.insertBefore(wrapper.firstChild, wrapper)
  }
  parent.removeChild(wrapper)
  return true
}

function collectWrapCandidate(base: HTMLElement): WrapCandidate | null {
  if (isRunWrapper(base.parentElement)) return null
  const nodes: ChildNode[] = [base]
  let cursor: ChildNode | null = base.nextSibling
  while (cursor) {
    nodes.push(cursor)
    if (
      cursor instanceof HTMLElement &&
      cursor.classList.contains(RUBY_PUNCT_TAIL_CLASS)
    ) {
      return base.parentNode ? { base, nodes } : null
    }
    cursor = cursor.nextSibling
  }
  return null
}

function wrapRun(candidate: WrapCandidate): HTMLElement | null {
  const parent = candidate.base.parentNode
  if (!parent || isRunWrapper(candidate.base.parentElement)) return null
  const wrapper = document.createElement('span')
  wrapper.className = RUBY_PUNCT_RUN_WRAPPER_CLASS
  wrapper.setAttribute(RUN_WRAPPER_FLAG, '1')
  parent.insertBefore(wrapper, candidate.base)
  for (const node of candidate.nodes) wrapper.appendChild(node)
  return wrapper
}

function withObserverPaused(view: EditorView, run: () => void): void {
  const observer = (view as unknown as { domObserver?: DomObserverControl })
    .domObserver
  observer?.stop?.()
  try {
    run()
  } finally {
    observer?.start?.()
  }
}

/**
 * Wrapper補正は表示専用であり、DOM競合や診断hookの失敗を入力処理へ
 * 波及させない。次回のview updateで再同期できるよう例外だけを隔離する。
 */
export function runRubyPunctuationDisplaySyncSafely(run: () => void): void {
  try {
    run()
  } catch {
    // Display-only best effort. ProseMirror state remains the source of truth.
  }
}

function sameDomSyncToken(
  left: RubyPunctuationDomSyncToken | null,
  right: RubyPunctuationDomSyncToken | null,
): boolean {
  if (left === null || right === null) return left === right
  return left.recordId === right.recordId && left.generation === right.generation
}

/**
 * coalesce される sync 要求の因果元 identity を追跡する pure tracker。
 *
 * 1 回の sync 実行へ**異なる identity の要求が混ざった場合は `null`**を返す。
 * どの flush の DOM 更新なのか識別できない件数を、推測でどれかへ足さないため。
 */
export function createRubyPunctuationDomSyncTokenTracker() {
  let pending: RubyPunctuationDomSyncToken | null = null
  let hasPending = false
  let ambiguous = false
  return {
    note(token: RubyPunctuationDomSyncToken | null): void {
      if (!hasPending) {
        hasPending = true
        pending = token
        return
      }
      if (!sameDomSyncToken(pending, token)) ambiguous = true
    },
    /** 実行時に 1 回だけ取り出す。取り出したら次の系列のために reset する。 */
    take(): RubyPunctuationDomSyncToken | null {
      const resolved = ambiguous ? null : pending
      pending = null
      hasPending = false
      ambiguous = false
      return resolved
    },
    reset(): void {
      pending = null
      hasPending = false
      ambiguous = false
    },
  }
}

export function createCoalescedRubyPunctuationSyncScheduler(options: {
  schedule?: (callback: () => void) => void
  run: () => void
}): CoalescedSyncScheduler {
  const schedule = options.schedule ?? queueMicrotask
  let scheduled = false
  let destroyed = false
  let generation = 0

  const request = () => {
    if (destroyed) return
    generation += 1
    if (scheduled) return
    scheduled = true
    schedule(() => {
      scheduled = false
      if (destroyed) return
      const runningGeneration = generation
      options.run()
      if (!destroyed && generation !== runningGeneration) request()
    })
  }

  return {
    request,
    destroy() {
      destroyed = true
      generation += 1
      scheduled = false
    },
  }
}

export function createRubyPunctuationWrapperController(
  view: EditorView,
  instrumentation?: RubyPunctuationNowrapInstrumentation,
  domSyncDiagnostics?: RubyPunctuationDomSyncDiagnostics,
): {
  update: (updatedView: EditorView) => void
  destroy: () => void
} {
  const tokenTracker = domSyncDiagnostics
    ? createRubyPunctuationDomSyncTokenTracker()
    : null
  const recordsByKey = new Map<string, WrapperRecord>()
  const recordsByBase = new Map<HTMLElement, WrapperRecord>()
  const pendingRemovedKeys = new Set<string>()
  const pendingDesiredKeys = new Set<string>()
  let pendingFull = true
  let destroyed = false
  let lastRevision =
    rubyPunctuationNowrapPluginKey.getState(view.state)?.revision ?? -1
  let selectedKeys = new Set<string>()
  let compositionKeys = new Set<string>()
  let wasComposing = view.composing

  const removeRecord = (record: WrapperRecord) => {
    if (recordsByKey.get(record.key) === record) {
      recordsByKey.delete(record.key)
    }
    if (recordsByBase.get(record.base) === record) {
      recordsByBase.delete(record.base)
    }
  }

  const reportRegistrySize = (): number => {
    emitRubyPunctuationNowrapInstrumentation(
      instrumentation,
      'registry-size',
      {
        recordsByKey: recordsByKey.size,
        recordsByBase: recordsByBase.size,
      },
    )
    return recordsByKey.size
  }

  const removeDisconnectedRecords = () => {
    const records = new Set([
      ...recordsByKey.values(),
      ...recordsByBase.values(),
    ])
    for (const record of records) {
      if (
        !record.wrapper.isConnected ||
        !record.base.isConnected ||
        record.base.parentElement !== record.wrapper
      ) {
        removeRecord(record)
      }
    }
  }

  const updateRecordKey = (record: WrapperRecord, nextKey: string) => {
    if (record.key === nextKey) return
    const wasSelected = selectedKeys.delete(record.key)
    const wasComposition = compositionKeys.delete(record.key)
    if (recordsByKey.get(record.key) === record) {
      recordsByKey.delete(record.key)
    }
    record.key = nextKey
    recordsByKey.set(nextKey, record)
    if (wasSelected) selectedKeys.add(nextKey)
    if (wasComposition) compositionKeys.add(nextKey)
  }

  const sync = () => {
    if (destroyed) return
    emitRubyPunctuationNowrapInstrumentation(instrumentation, 'sync-run')
    // 因果元 identity は sync を **要求した時点** のもの。混線した系列は null。
    const syncToken = tokenTracker?.take() ?? null
    let nodeDomLookups = 0
    let wraps = 0
    let unwraps = 0
    const reportDomSync = (registrySize: number | null) => {
      if (!syncToken || !domSyncDiagnostics) return
      try {
        domSyncDiagnostics.report(syncToken, {
          syncRuns: 1,
          nodeDomLookups,
          wraps,
          unwraps,
          registrySize,
        })
      } catch {
        // 診断のみ。表示専用 DOM sync へ返さない。
      }
    }
    const pluginState = rubyPunctuationNowrapPluginKey.getState(view.state)
    if (!pluginState) {
      reportDomSync(null)
      return
    }

    // DOM再生成で切断されたwrapper/baseは、接続中のDOM操作とは別に必ず破棄する。
    removeDisconnectedRecords()

    const desiredRuns = pendingFull
      ? pluginState.runs
      : [...pendingDesiredKeys]
          .map((key) => pluginState.runByKey.get(key))
          .filter((run): run is RubyPunctuationRun => Boolean(run))
    const activeKeys = new Set([...selectedKeys, ...compositionKeys])
    const claimedRecords = new Set<WrapperRecord>()
    const unwrapCandidates = new Set<WrapperRecord>()
    const wrapCandidates: Array<{
      key: string
      candidate: WrapCandidate
    }> = []

    for (const run of desiredRuns) {
      const key = rubyPunctuationRunKey(run)
      emitRubyPunctuationNowrapInstrumentation(
        instrumentation,
        'node-dom-lookup',
        {
          rubyFrom: run.rubyFrom,
        },
      )
      if (syncToken) nodeDomLookups += 1
      const base = view.nodeDOM(run.rubyFrom)
      if (!(base instanceof HTMLElement)) continue

      let record = recordsByBase.get(base)
      if (!record && isRunWrapper(base.parentElement)) {
        record = { key, base, wrapper: base.parentElement }
        recordsByBase.set(base, record)
        recordsByKey.set(key, record)
      } else if (record) {
        updateRecordKey(record, key)
      }

      if (record) {
        claimedRecords.add(record)
        if (
          !record.wrapper.isConnected ||
          !record.base.isConnected ||
          record.base.parentElement !== record.wrapper
        ) {
          removeRecord(record)
          record = undefined
        }
      }

      if (
        classifyRubyPunctuationWrapperDisposition(view.state.doc, run) ===
        'suppressed-later-special-inline'
      ) {
        if (record) unwrapCandidates.add(record)
        continue
      }

      if (
        activeKeys.has(key) ||
        compositionKeys.has(key) ||
        selectedKeys.has(key)
      ) {
        if (record) unwrapCandidates.add(record)
        continue
      }
      if (record) continue
      const candidate = collectWrapCandidate(base)
      if (candidate) wrapCandidates.push({ key, candidate })
    }

    const removalKeys = pendingFull
      ? [...recordsByKey.keys()]
      : [...pendingRemovedKeys]
    for (const key of removalKeys) {
      const record = recordsByKey.get(key)
      if (record && !claimedRecords.has(record)) unwrapCandidates.add(record)
    }

    pendingFull = false
    pendingRemovedKeys.clear()
    pendingDesiredKeys.clear()

    const connectedUnwraps: WrapperRecord[] = []
    for (const record of unwrapCandidates) {
      if (
        record.wrapper.isConnected &&
        record.base.isConnected &&
        record.base.parentElement === record.wrapper
      ) {
        connectedUnwraps.push(record)
      } else {
        // 切断済みrecordも両registryから除去し、DOM参照を保持しない。
        removeRecord(record)
      }
    }
    if (connectedUnwraps.length === 0 && wrapCandidates.length === 0) {
      reportDomSync(reportRegistrySize())
      return
    }

    emitRubyPunctuationNowrapInstrumentation(
      instrumentation,
      'observer-pause',
    )
    withObserverPaused(view, () => {
      for (const record of connectedUnwraps) {
        if (unwrapRun(record.wrapper)) {
          emitRubyPunctuationNowrapInstrumentation(
            instrumentation,
            'unwrap',
          )
          if (syncToken) unwraps += 1
        }
        removeRecord(record)
      }
      for (const { key, candidate } of wrapCandidates) {
        const wrapper = wrapRun(candidate)
        if (!wrapper) continue
        const record = { key, base: candidate.base, wrapper }
        recordsByKey.set(key, record)
        recordsByBase.set(candidate.base, record)
        emitRubyPunctuationNowrapInstrumentation(instrumentation, 'wrap')
        if (syncToken) wraps += 1
      }
    })
    reportDomSync(reportRegistrySize())
  }

  const scheduler = createCoalescedRubyPunctuationSyncScheduler({
    run: () => runRubyPunctuationDisplaySyncSafely(sync),
  })

  const requestSync = () => {
    if (tokenTracker && domSyncDiagnostics) {
      let token: RubyPunctuationDomSyncToken | null = null
      try {
        token = domSyncDiagnostics.readToken()
      } catch {
        token = null
      }
      tokenTracker.note(token)
    }
    emitRubyPunctuationNowrapInstrumentation(
      instrumentation,
      'sync-request',
    )
    scheduler.request()
  }

  const applyDomPlan = (
    pluginState: RubyPunctuationNowrapPluginState,
  ): boolean => {
    if (pluginState.domPlan.kind === 'full') {
      pendingFull = true
      return true
    }
    let needsSync = false
    for (const rekey of pluginState.domPlan.rekeyedRuns) {
      const record = recordsByKey.get(rekey.from)
      if (record) updateRecordKey(record, rekey.to)
      if (selectedKeys.delete(rekey.from)) selectedKeys.add(rekey.to)
      if (compositionKeys.delete(rekey.from)) compositionKeys.add(rekey.to)
    }
    for (const replacement of pluginState.domPlan.replacementRunKeys) {
      if (selectedKeys.delete(replacement.from)) {
        selectedKeys.add(replacement.to)
      }
      if (compositionKeys.delete(replacement.from)) {
        compositionKeys.add(replacement.to)
      }
    }
    for (const key of pluginState.domPlan.removedRunKeys) {
      pendingRemovedKeys.add(key)
      needsSync ||= recordsByKey.has(key)
    }
    for (const key of pluginState.domPlan.addedRunKeys) {
      pendingDesiredKeys.add(key)
      needsSync = true
    }
    return needsSync
  }

  const refreshEditTargets = (
    updatedView: EditorView,
    pluginState: RubyPunctuationNowrapPluginState,
  ): boolean => {
    const nextSelectedKeys = selectionRunKeys(updatedView.state, pluginState)
    const previousTargetKeys = new Set([...selectedKeys, ...compositionKeys])
    const composing = updatedView.composing
    if (composing) {
      for (const key of nextSelectedKeys) compositionKeys.add(key)
    } else if (wasComposing) {
      compositionKeys.clear()
    }
    wasComposing = composing
    selectedKeys = nextSelectedKeys
    const nextTargetKeys = new Set([...selectedKeys, ...compositionKeys])
    let changed = previousTargetKeys.size !== nextTargetKeys.size
    if (!changed) {
      changed = [...previousTargetKeys].some((key) => !nextTargetKeys.has(key))
    }
    if (changed) {
      for (const key of previousTargetKeys) pendingDesiredKeys.add(key)
      for (const key of nextTargetKeys) pendingDesiredKeys.add(key)
    }
    return changed
  }

  const captureCompositionTargets = (event: Event) => {
    const pluginState = rubyPunctuationNowrapPluginKey.getState(view.state)
    if (!pluginState) return
    const touched = selectionRunKeys(view.state, pluginState)
    for (const key of compositionBoundaryRunKeys(view, event, pluginState)) {
      touched.add(key)
    }
    for (const key of touched) {
      compositionKeys.add(key)
      pendingDesiredKeys.add(key)
    }
    if (touched.size > 0) requestSync()
  }

  const releaseCompositionTargets = () => {
    queueMicrotask(() => {
      if (destroyed) return
      const previous = [...compositionKeys]
      compositionKeys.clear()
      for (const key of previous) pendingDesiredKeys.add(key)
      const pluginState = rubyPunctuationNowrapPluginKey.getState(view.state)
      if (pluginState) refreshEditTargets(view, pluginState)
      if (previous.length > 0) requestSync()
    })
  }

  view.dom.addEventListener('compositionstart', captureCompositionTargets, true)
  view.dom.addEventListener('compositionend', releaseCompositionTargets, true)

  const initialState = rubyPunctuationNowrapPluginKey.getState(view.state)
  if (initialState) {
    selectedKeys = selectionRunKeys(view.state, initialState)
    if (view.composing) compositionKeys = new Set(selectedKeys)
  }
  requestSync()

  return {
    update(updatedView) {
      if (destroyed) return
      const pluginState = rubyPunctuationNowrapPluginKey.getState(
        updatedView.state,
      )
      if (!pluginState) return
      let needsSync = false
      if (pluginState.revision !== lastRevision) {
        lastRevision = pluginState.revision
        needsSync = applyDomPlan(pluginState)
      }
      needsSync ||= refreshEditTargets(updatedView, pluginState)
      if (needsSync) requestSync()
    },
    destroy() {
      destroyed = true
      tokenTracker?.reset()
      scheduler.destroy()
      view.dom.removeEventListener(
        'compositionstart',
        captureCompositionTargets,
        true,
      )
      view.dom.removeEventListener(
        'compositionend',
        releaseCompositionTargets,
        true,
      )
      const wrappers = new Set<HTMLElement>(
        [...recordsByKey.values()].map((record) => record.wrapper),
      )
      for (const wrapper of view.dom.querySelectorAll<HTMLElement>(
        `span[${RUN_WRAPPER_FLAG}]`,
      )) {
        wrappers.add(wrapper)
      }
      const connected = [...wrappers].filter((wrapper) => wrapper.isConnected)
      if (connected.length > 0) {
        emitRubyPunctuationNowrapInstrumentation(
          instrumentation,
          'observer-pause',
        )
        runRubyPunctuationDisplaySyncSafely(() => {
          withObserverPaused(view, () => {
            for (const wrapper of connected) {
              if (unwrapRun(wrapper)) {
                emitRubyPunctuationNowrapInstrumentation(
                  instrumentation,
                  'unwrap',
                )
              }
            }
          })
        })
      }
      recordsByKey.clear()
      recordsByBase.clear()
    },
  }
}
