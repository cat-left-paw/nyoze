/**
 * LOCAL-WINDOW-SELECTIONOWN1-POINTER1 — Local Window active 中の host 本文 pointer
 * selection ownership を host PM へ渡す。
 *
 * 責務は **pointer ownership / listener / lease / cleanup** だけ。commit、DOM proof、
 * selection mapping、caret 復元は既存 controller 経路が所有し、ここでは再実装しない。
 *
 * 契約:
 * - hit-test より前（pointerdown を受ける前）から overlay を pointer 透過にするのは
 *   controller 側の `pointer-events` funnel。この module は「透過して届いた同じ trusted
 *   gesture を host へ通してよいか」だけを同期判定する。
 * - 成功時は `preventDefault()` も `stopPropagation()` もせず、元の trusted event を
 *   そのまま host PM / browser へ継続させる。synthetic event の生成・再配送、
 *   retarget、座標 → PM 変換、endpoint 追跡、Custom Highlight、独自 auto-scroll、
 *   timer / polling / quiet period / rAF による ownership 推測は一切持たない。
 * - 失敗時は **その gesture だけ**を同期的に止め、local ownership / recovery と draft を
 *   維持する（host selection intent を漏らさない）。再配送も遅延再実行もしない。
 * - lease は最大 1 件で pointerId だけを保持する。endpoint 座標や selection 内容は
 *   保持しない。handoff 成功で Local Window が off になっても、取得済み lease は
 *   gesture 終端（pointerup / pointercancel）まで残す。
 */

/** 既存 document-action barrier へ渡す reason。新しい barrier は作らない。 */
export const LOCAL_IME_LOCAL_WINDOW_POINTER_HANDOFF_REASON = 'local-window-pointer'

export type LocalImeLocalWindowPointerHostFirstRejectReason =
  | 'session-off'
  | 'recovery-required'
  | 'closing-or-busy'
  | 'composing'
  | 'pending-boundary'
  | 'local-view-detached'
  | 'local-selection-not-collapsed-text'
  | 'draft-not-extractable'
  | 'identity-invalid'
  | 'base-proof-invalid'

export type LocalImeLocalWindowPointerHostFirstDecision =
  | { readonly hostFirst: true }
  | { readonly hostFirst: false; readonly reason: LocalImeLocalWindowPointerHostFirstRejectReason }

/**
 * pointer 透過と handoff を許可する ownership eligibility。CSS の `pointer-events` は
 * button / modifier / pointerType を事前分類できないため、pointer 種別では絞らない
 * （1-block `OVERLAY-SELECTIONOWN1-POINTER-CLEAN1` と同じ製品判断）。
 *
 * `proveBase` は base / Fragment / DOM proof の再証明で、他条件を満たしたときだけ
 * 評価する（hot path で不要な DOM 走査をしない）。
 */
export function resolveLocalImeLocalWindowPointerHostFirst(input: {
  readonly mode: 'off' | 'active-clean' | 'active-dirty' | 'composing' | 'closing' | 'recovery-required'
  readonly compositionActive: boolean
  readonly pendingBoundary: boolean
  readonly localViewConnected: boolean
  /** local selection が collapsed な top-level text selection か（PM 型は controller 側）。 */
  readonly localSelectionCollapsedText: boolean
  /** 現 session の draft を既存 commit builder が抽出できる形か。 */
  readonly draftExtractable: boolean
  /** document identity / controller generation が current と一致するか。 */
  readonly identityValid: boolean
  readonly proveBase: () => boolean
}): LocalImeLocalWindowPointerHostFirstDecision {
  if (input.mode === 'off') return { hostFirst: false, reason: 'session-off' }
  if (input.mode === 'recovery-required') return { hostFirst: false, reason: 'recovery-required' }
  if (input.mode === 'closing') return { hostFirst: false, reason: 'closing-or-busy' }
  if (input.mode === 'composing' || input.compositionActive) {
    return { hostFirst: false, reason: 'composing' }
  }
  if (input.pendingBoundary) return { hostFirst: false, reason: 'pending-boundary' }
  if (!input.localViewConnected) return { hostFirst: false, reason: 'local-view-detached' }
  if (!input.localSelectionCollapsedText) {
    return { hostFirst: false, reason: 'local-selection-not-collapsed-text' }
  }
  if (!input.draftExtractable) return { hostFirst: false, reason: 'draft-not-extractable' }
  if (!input.identityValid) return { hostFirst: false, reason: 'identity-invalid' }
  if (!input.proveBase()) return { hostFirst: false, reason: 'base-proof-invalid' }
  return { hostFirst: true }
}

/**
 * host root 内で pointer selection handoff を **回避してよい唯一の入口**。
 *
 * `LOCAL-WINDOW-FOLD-HANDOFF1` で heading fold だけが Local Window の exact-one
 * document-action barrier（`prepareLocalImeForDocumentAction`）へ接続済みなので、
 * その click は既存 barrier に所有させる。
 *
 * link / HR / checklist / note anchor / 埋め込み control は Local Window barrier へ
 * 接続されていない。Local Window active 中は共有 `getIsComposing()` が true になるため、
 * それらを一括で ignore すると **dirty window を commit しないまま** host focus /
 * selection だけが動き、修飾 link は blocked、HR / checklist は no-op になる。
 * よってそれらは通常どおり pointer handoff（close / commit → 元 event 継続）へ渡し、
 * close 後の host 側 command は既存 `createEditorClickHandler` の preflight が扱う。
 *
 * 値は `FOLD_TOGGLE_CLASS`（`src/editor-core/extensions/headingFold.ts`）と一致させる。
 * この module は import 0 を保つため、一致は unit の source 検査で固定する。
 */
export const LOCAL_IME_LOCAL_WINDOW_POINTER_DOCUMENT_ACTION_SELECTOR = '.heading-fold-toggle'

export function isLocalImeLocalWindowPointerDocumentActionTarget(
  target: EventTarget | null,
): boolean {
  const element =
    target instanceof Element
      ? target
      : target instanceof Node
        ? target.parentElement
        : null
  return element?.closest(LOCAL_IME_LOCAL_WINDOW_POINTER_DOCUMENT_ACTION_SELECTOR) != null
}

export type LocalImeLocalWindowPointerGestureAction =
  /** Local Window の ownership 対象外。event へ一切介入しない。 */
  | {
      readonly action: 'ignore'
      readonly reason: 'session-off' | 'target-outside-host' | 'document-action-control'
    }
  /** host selection intent を漏らさないよう、この gesture だけを同期的に止める。 */
  | {
      readonly action: 'fail-closed'
      readonly reason:
        | 'not-trusted'
        | 'target-detached'
        | LocalImeLocalWindowPointerHostFirstRejectReason
    }
  /** 同期 close / commit を試みてよい。成功しなければ fail-closed へ落とす。 */
  | { readonly action: 'handoff' }

/**
 * pointerdown 時の分類。座標、drag 距離、selection 内容、PM 位置は見ない。
 *
 * host root 外（toolbar / pane / modal 等の app UI）は既存 document-action barrier の
 * 担当なので `ignore` とし、pointer handoff からは触らない。
 */
export function resolveLocalImeLocalWindowPointerGesture(input: {
  readonly sessionActive: boolean
  readonly isTrusted: boolean
  readonly targetInsideHostRoot: boolean
  readonly targetConnected: boolean
  /** 既存 document action の入口（fold widget / link / note anchor 等）か。 */
  readonly targetIsDocumentActionControl: boolean
  readonly hostFirst: LocalImeLocalWindowPointerHostFirstDecision
}): LocalImeLocalWindowPointerGestureAction {
  if (!input.sessionActive) return { action: 'ignore', reason: 'session-off' }
  if (!input.targetInsideHostRoot) return { action: 'ignore', reason: 'target-outside-host' }
  if (input.targetIsDocumentActionControl) {
    return { action: 'ignore', reason: 'document-action-control' }
  }
  if (!input.targetConnected) return { action: 'fail-closed', reason: 'target-detached' }
  if (!input.isTrusted) return { action: 'fail-closed', reason: 'not-trusted' }
  if (!input.hostFirst.hostFirst) return { action: 'fail-closed', reason: input.hostFirst.reason }
  return { action: 'handoff' }
}

/**
 * 既存 session mode の射影。Local Window は `off` 以外を継続条件にしないため、
 * 判定は `'off'` かどうかだけを見る（新しい state machine を作らない）。
 */
export type LocalImeLocalWindowPointerSessionMode =
  | 'off'
  | 'armed'
  | 'composing'
  | 'flushing'
  | 'handoff'
  | 'awaiting-end'
  | 'recovery-required'
  | 'suspended'
  | 'destroyed'

export type LocalImeLocalWindowPointerPostCloseProof =
  | { readonly continueGesture: true }
  | {
      readonly continueGesture: false
      readonly reason:
        | 'preparation-not-ready'
        | 'session-not-off'
        | 'target-detached'
        | 'target-outside-host'
    }

/**
 * close / commit 後の再証明。dirty commit で host DOM が置換され得るため、元の
 * trusted event の target が **commit 後の host PM 内で connected のまま**であることを
 * 再証明できた場合だけ gesture を継続させる。detach していれば selection を開始させない。
 */
export function resolveLocalImeLocalWindowPointerPostCloseProof(input: {
  readonly preparationStatus: 'ready' | 'wait-for-composition' | 'busy-flushing' | 'recovery-required'
  readonly sessionModeAfter: LocalImeLocalWindowPointerSessionMode
  readonly targetConnected: boolean
  readonly targetInsideHostRoot: boolean
}): LocalImeLocalWindowPointerPostCloseProof {
  if (input.preparationStatus !== 'ready') {
    return { continueGesture: false, reason: 'preparation-not-ready' }
  }
  if (input.sessionModeAfter !== 'off') {
    return { continueGesture: false, reason: 'session-not-off' }
  }
  if (!input.targetConnected) return { continueGesture: false, reason: 'target-detached' }
  if (!input.targetInsideHostRoot) {
    return { continueGesture: false, reason: 'target-outside-host' }
  }
  return { continueGesture: true }
}

export type LocalImeLocalWindowPointerLeaseReleaseReason =
  | 'pointerup'
  | 'pointercancel'
  /**
   * 遮断中 gesture の終端後に次の `pointerdown` が来た（timer なしの唯一の
   * 「新しい gesture が始まった」signal）。派生 click 系を取りこぼさないため、
   * click / auxclick / dblclick / contextmenu では解除しない。
   */
  | 'gesture-ended'
  | 'foreign-pointerdown'
  | 'document-change'
  | 'generation'
  | 'force-reset'
  | 'recovery'
  | 'lifecycle-cancel'
  | 'destroy'
  | 'replaced'

/**
 * pointerdown を cancel しても仕様上そのまま発火する click 系 event。
 * fail-closed した gesture ではこれらも同期遮断しないと host へ漏れる。
 */
const SUPPRESSED_CLICK_EVENTS = ['click', 'auxclick', 'dblclick', 'contextmenu'] as const

/** `denied` = 遮断中 gesture が live なので、この press を分類せず捨てる。 */
export type LocalImeLocalWindowPointerLeaseIncomingPointerDown = 'denied' | 'none'

export type LocalImeLocalWindowPointerLeaseIdentity = {
  readonly documentIdentity: string
  readonly controllerGeneration: number
}

/**
 * `handoff`: 元 trusted event を host へ継続させた成功 gesture。観測と cleanup だけを行う。
 * `suppressed`: fail-closed した gesture。**その gesture の終端まで**限定的に遮断する。
 */
export type LocalImeLocalWindowPointerLeaseMode = 'handoff' | 'suppressed'

export type LocalImeLocalWindowPointerLeaseToken =
  | (LocalImeLocalWindowPointerLeaseIdentity & {
      /** lease を取った pointer 自身の `pointerId`。座標も履歴も持たない。 */
      readonly pointerId: number
      readonly mode: 'handoff'
    })
  | (LocalImeLocalWindowPointerLeaseIdentity & {
      readonly pointerId: number
      readonly mode: 'suppressed'
      /** 遮断対象になった `pointerdown` の target。座標も PM position も持たない。 */
      readonly downTarget: EventTarget | null
      /**
       * `pointerdown` target から「同じ gesture 由来か」の判定を作る factory。
       * 拒否した別 pointer にも同じ方法で scope を作るため、bound な predicate ではなく
       * factory を受け取る（DOM policy は runtime 側に置く）。
       * 座標、PM position、selection endpoint は持たない（`OVERLAY-DIRTYPOINTER-HANDOFF1`
       * と同じ target / path containment の discriminator だけを使う）。
       */
      readonly createGestureScope: (
        downTarget: EventTarget | null,
      ) => (candidate: EventTarget | null) => boolean
    })

export type LocalImeLocalWindowPointerLeaseDiagnostics = {
  readonly held: boolean
  readonly mode: LocalImeLocalWindowPointerLeaseMode | null
  /** 遮断中 gesture が所有する **全** pointer が terminal を通過したか。 */
  readonly terminalSeen: boolean
  /** 遮断中 gesture が所有している pointer 数（元 pointer + 拒否した pointer）。 */
  readonly ownedPointerCount: number
  /** 遮断した event 数（pointerdown / pointermove / pointerup / click 系）。 */
  readonly suppressedEventCount: number
  /** 遮断中 gesture の live 中に拒否した別 pointer の `pointerdown` 数。 */
  readonly deniedPointerDownCount: number
  readonly pointerId: number | null
  /**
   * 生存中の terminal listener 数（idle は 0、gesture 中は 3）。
   * `pointerup` / `pointercancel` に加え、対象外 pointer の `pointerdown` による
   * 安全な失効も lease 自身が観測する（session listener とは独立）。
   */
  readonly listenerCount: number
  readonly acquireCount: number
  readonly suppressedAcquireCount: number
  readonly releaseCount: number
  readonly lastRelease: LocalImeLocalWindowPointerLeaseReleaseReason | null
  readonly staleDropCount: number
  readonly foreignPointerIgnoreCount: number
}

export type LocalImeLocalWindowPointerLease = {
  acquire: (token: LocalImeLocalWindowPointerLeaseToken) => boolean
  release: (reason: LocalImeLocalWindowPointerLeaseReleaseReason) => boolean
  releaseIfStale: () => boolean
  /**
   * 新しい `pointerdown` を lease へ先に通す。`denied` なら runtime は分類も
   * handoff も行わず即 return する（元の遮断 gesture を live のまま維持する）。
   */
  noteIncomingPointerDown: (
    pointerId: number,
    event: Event,
  ) => LocalImeLocalWindowPointerLeaseIncomingPointerDown
  isHeld: () => boolean
  getPointerId: () => number | null
  diagnostics: () => LocalImeLocalWindowPointerLeaseDiagnostics
  destroy: () => void
}

/**
 * 最大 1 件の pointer gesture lease。terminal は対象 gesture 自身の event と明示 lifecycle
 * 解除だけで、**timer / polling / quiet period による timeout は持たない**。
 * `pointerup` 時に host selection を読まず、stable point も通知しない。
 *
 * `mode: 'handoff'`（成功）は観測専用で、既定動作も伝播も止めない。対象 pointer の
 * `pointerup` / `pointercancel` で解除する。
 *
 * `mode: 'suppressed'`（fail-closed）は **その gesture だけ**を終端まで所有する。
 * pointerdown を cancel しても `click` / `auxclick` / `dblclick` / `contextmenu` は仕様上
 * そのまま発火し、double click では 2 回目の `click` の後に `dblclick` が、secondary では
 * `contextmenu` の後に `auxclick` が続く。したがって click 系では **解除せず**、
 * gesture scope 内の click 系を取りこぼさず遮断し続ける。
 *
 * 解除は次だけで、timer / polling / quiet period / rAF による時間推測はしない。
 * (1) 対象 pointer の `pointercancel`（派生 click 系が続かない）
 * (2) terminal 後の次の `pointerdown`（新しい gesture の開始 signal。その event 自体は遮断しない）
 * (3) terminal 前に **同じ pointerId** の `pointerdown` が来た場合（`pointerup` を取り逃した証拠）
 * (4) 明示 lifecycle / stale identity / destroy
 *
 * terminal 前の **別 pointerId** の `pointerdown` では解除しない。元 gesture が live のまま
 * 無防備になるのを防ぐため、その press 自体を遮断して複数 pointer を安全に拒否する
 * （touch / pen は正式 Go 対象外だが fail-closed は壊さない）。
 *
 * click 系は `isWithinGestureScope` に一致するものだけを遮断する。keyboard 由来 click や
 * 別 UI の click を巻き込まない。
 */
export function createLocalImeLocalWindowPointerLease(options: {
  getCurrentIdentity: () => LocalImeLocalWindowPointerLeaseIdentity | null
  onRelease?: (notice: {
    mode: LocalImeLocalWindowPointerLeaseMode
    reason: LocalImeLocalWindowPointerLeaseReleaseReason
    stale: boolean
  }) => void
}): LocalImeLocalWindowPointerLease {
  let held: LocalImeLocalWindowPointerLeaseToken | null = null
  let detach: (() => void) | null = null
  let listenerCount = 0
  let acquireCount = 0
  let suppressedAcquireCount = 0
  let releaseCount = 0
  let staleDropCount = 0
  let foreignPointerIgnoreCount = 0
  let suppressedEventCount = 0
  let deniedPointerDownCount = 0
  /**
   * 遮断中 gesture が所有する pointer。元 pointer に加え、live 中に拒否した別 pointer も
   * **その terminal と派生 click まで**追う（拒否しただけで手放すと後続 event が host へ漏れる）。
   */
  let owned: {
    pointerId: number
    isWithinGestureScope: (candidate: EventTarget | null) => boolean
    terminalSeen: boolean
  }[] = []
  let lastPointerDownEvent: Event | null = null
  let lastPointerDownOutcome: LocalImeLocalWindowPointerLeaseIncomingPointerDown = 'none'
  let lastRelease: LocalImeLocalWindowPointerLeaseReleaseReason | null = null
  let destroyed = false

  /** 遮断は既定動作と伝播だけを止める。synthetic 再配送も retarget もしない。 */
  const suppressEvent = (event: Event): void => {
    suppressedEventCount += 1
    if (event.cancelable) event.preventDefault()
    event.stopPropagation()
  }

  const sameIdentity = (
    a: LocalImeLocalWindowPointerLeaseIdentity | null,
    b: LocalImeLocalWindowPointerLeaseIdentity | null,
  ): boolean =>
    a !== null &&
    b !== null &&
    a.documentIdentity === b.documentIdentity &&
    a.controllerGeneration === b.controllerGeneration

  /** 所有 pointer が全て terminal を通過したか（派生 click はまだ来得る）。 */
  const allOwnedTerminated = (): boolean =>
    owned.length > 0 && owned.every((pointer) => pointer.terminalSeen)

  const releaseInternal = (
    reason: LocalImeLocalWindowPointerLeaseReleaseReason,
    stale = false,
  ): boolean => {
    if (held === null) return false
    const releasedMode = held.mode
    held = null
    owned = []
    detach?.()
    detach = null
    releaseCount += 1
    lastRelease = reason
    options.onRelease?.({ mode: releasedMode, reason, stale })
    return true
  }

  /** stale identity は pointerId に関わらず捨てる。共通の前段検証。 */
  const dropIfStale = (reason: LocalImeLocalWindowPointerLeaseReleaseReason): boolean => {
    if (sameIdentity(held, options.getCurrentIdentity())) return false
    releaseInternal(reason, true)
    staleDropCount += 1
    return true
  }

  const onTerminal = (
    reason: 'pointerup' | 'pointercancel',
    pointerId: number,
    event: Event,
  ): void => {
    if (destroyed || held === null) return
    // identity を先に検証する。document 入替 / generation 交代後の lease は
    // pointerId に関わらず捨てる（別 pointer の terminal で旧 lease が生き残らない）。
    if (dropIfStale(reason)) return
    if (held.mode === 'suppressed') {
      // 所有していない pointer（down を見ていない）だけを inert に扱う。
      const index = owned.findIndex((pointer) => pointer.pointerId === pointerId)
      if (index < 0) {
        foreignPointerIgnoreCount += 1
        return
      }
      suppressEvent(event)
      if (reason === 'pointercancel') {
        // cancel された pointer には派生 click 系が続かないので所有から外す。
        owned.splice(index, 1)
        if (owned.length === 0) releaseInternal('pointercancel')
        return
      }
      // `pointerup` の後は click / dblclick / auxclick / contextmenu が続き得るので、
      // 所有は保ったまま terminal だけを記録する。
      owned[index].terminalSeen = true
      return
    }
    if (held.pointerId !== pointerId) {
      foreignPointerIgnoreCount += 1
      return
    }
    releaseInternal(reason)
  }

  const onSuppressedMove = (pointerId: number, event: Event): void => {
    if (destroyed || held === null || held.mode !== 'suppressed') return
    // 元 pointer と、拒否した別 pointer の move をどちらも terminal まで遮断する。
    const pointer = owned.find((entry) => entry.pointerId === pointerId)
    if (!pointer || pointer.terminalSeen) return
    suppressEvent(event)
  }

  /**
   * 遮断中 gesture が生む click / auxclick / dblclick / contextmenu を遮断する。
   * **解除はしない**（double click の `dblclick`、secondary の `auxclick` を取りこぼさない）。
   * scope 外（keyboard 由来 click、別 UI の click）は一切触らない。
   */
  const onSuppressedClickFamily = (event: Event): void => {
    if (destroyed || held === null || held.mode !== 'suppressed') return
    // 所有 pointer の **いずれか**の scope に一致するものだけを遮断する。
    // 拒否した別 pointer が別位置で press していても、その派生 click を取りこぼさない。
    if (!owned.some((pointer) => pointer.isWithinGestureScope(event.target))) return
    suppressEvent(event)
  }

  /**
   * 新しい `pointerdown` に対する唯一の判断。timer は持たない。
   *
   * - terminal 済み: 次の press は新しい gesture なので、**その event を遮断せずに**解除する。
   * - terminal 前で同じ pointerId: `pointerup` を取り逃した証拠なので解除する（dead lock 防止）。
   * - terminal 前で別 pointerId: 元 gesture が live なので解除せず、その press を遮断して
   *   `denied` を返す（複数 pointer を安全に拒否し、元 gesture を無防備にしない）。
   *
   * runtime の session listener と lease 自身の listener の両方から呼ばれるので、
   * 同じ event object に対する判断は 1 回だけ行う（二重遮断・二重計上をしない）。
   */
  const handleIncomingPointerDown = (
    pointerId: number,
    event: Event,
  ): LocalImeLocalWindowPointerLeaseIncomingPointerDown => {
    if (destroyed) return 'none'
    if (lastPointerDownEvent === event) return lastPointerDownOutcome
    lastPointerDownEvent = event
    lastPointerDownOutcome = 'none'
    if (held === null) return 'none'
    if (dropIfStale('generation')) return 'none'
    if (held.mode === 'suppressed') {
      if (allOwnedTerminated()) {
        // 所有 pointer が **全て** 終端していれば、この press は新しい gesture である。
        releaseInternal('gesture-ended')
        return 'none'
      }
      const existing = owned.find((pointer) => pointer.pointerId === pointerId)
      if (existing && owned.length === 1) {
        // 単独所有の pointerId が終端前に再 press された = `pointerup` を取り逃した証拠。
        // 他に守るべき pointer が無いので解除し、runtime へ再分類させる（dead lock 防止）。
        releaseInternal('gesture-ended')
        return 'none'
      }
      if (existing) {
        // 他 pointer をまだ所有しているので lease 全体は解除しない（他を無防備にしない）。
        // pointerId は再利用されるため、**この entry の scope を新しい press の target へ
        // 更新**してから拒否する（旧 target の scope のままだと新 gesture の click が漏れる）。
        existing.isWithinGestureScope = held.createGestureScope(event.target)
        existing.terminalSeen = false
      } else {
        owned.push({
          pointerId,
          isWithinGestureScope: held.createGestureScope(event.target),
          terminalSeen: false,
        })
      }
      deniedPointerDownCount += 1
      suppressEvent(event)
      lastPointerDownOutcome = 'denied'
      return 'denied'
    }
    if (held.pointerId === pointerId) return 'none'
    releaseInternal('foreign-pointerdown')
    return 'none'
  }

  return {
    acquire(token) {
      if (destroyed) return false
      if (held !== null) releaseInternal('replaced')
      held = { ...token }
      owned = token.mode === 'suppressed'
        ? [{
            pointerId: token.pointerId,
            isWithinGestureScope: token.createGestureScope(token.downTarget),
            terminalSeen: false,
          }]
        : []
      acquireCount += 1
      if (token.mode === 'suppressed') suppressedAcquireCount += 1
      const onPointerUp = (event: Event) =>
        onTerminal('pointerup', (event as PointerEvent).pointerId, event)
      const onPointerCancel = (event: Event) =>
        onTerminal('pointercancel', (event as PointerEvent).pointerId, event)
      const onPointerDown = (event: Event) => {
        handleIncomingPointerDown((event as PointerEvent).pointerId, event)
      }
      // `handoff` では capture で gesture 終端を観測するだけで、default 抑止も
      // 伝播停止も行わない。`suppressed` だけが同じ gesture の残り event を遮断する。
      document.addEventListener('pointerup', onPointerUp, true)
      document.addEventListener('pointercancel', onPointerCancel, true)
      document.addEventListener('pointerdown', onPointerDown, true)
      const detachers: (() => void)[] = [
        () => document.removeEventListener('pointerup', onPointerUp, true),
        () => document.removeEventListener('pointercancel', onPointerCancel, true),
        () => document.removeEventListener('pointerdown', onPointerDown, true),
      ]
      if (token.mode === 'suppressed') {
        const onPointerMove = (event: Event) =>
          onSuppressedMove((event as PointerEvent).pointerId, event)
        document.addEventListener('pointermove', onPointerMove, true)
        detachers.push(() => document.removeEventListener('pointermove', onPointerMove, true))
        for (const type of SUPPRESSED_CLICK_EVENTS) {
          document.addEventListener(type, onSuppressedClickFamily, true)
          detachers.push(() => document.removeEventListener(type, onSuppressedClickFamily, true))
        }
      }
      listenerCount = detachers.length
      detach = () => {
        for (const remove of detachers) remove()
        listenerCount = 0
      }
      return true
    },
    release: (reason) => releaseInternal(reason),
    noteIncomingPointerDown: handleIncomingPointerDown,
    releaseIfStale() {
      if (held === null) return false
      if (sameIdentity(held, options.getCurrentIdentity())) return false
      releaseInternal('generation', true)
      staleDropCount += 1
      return true
    },
    isHeld: () => held !== null,
    getPointerId: () => held?.pointerId ?? null,
    diagnostics: () => ({
      held: held !== null,
      mode: held?.mode ?? null,
      terminalSeen: allOwnedTerminated(),
      ownedPointerCount: owned.length,
      suppressedEventCount,
      deniedPointerDownCount,
      pointerId: held?.pointerId ?? null,
      listenerCount,
      acquireCount,
      suppressedAcquireCount,
      releaseCount,
      lastRelease,
      staleDropCount,
      foreignPointerIgnoreCount,
    }),
    destroy() {
      releaseInternal('destroy')
      destroyed = true
      detach?.()
      detach = null
    },
  }
}

export type LocalImeLocalWindowPointerHandoffDiagnostics = {
  /** document capture の共有`pointerdown` listener数。session / product associationで共用。 */
  readonly pointerdownListenerCount: number
  readonly productEntryAssociationEnabled: boolean
  readonly productEntryAssociationCount: number
  readonly handoffCount: number
  readonly failClosedCount: number
  readonly ignoredCount: number
  readonly lastAction:
    | 'ignore'
    | 'fail-closed'
    | 'handoff'
    | 'product-entry-association'
    | null
  readonly lastReason: string | null
  /** 直近 handoff の pointerdown capture → close / commit 完了の同期時間（ms）。 */
  readonly lastCloseDurationMs: number | null
  /** 直近 handoff で close / commit が増やした host content transaction 数。 */
  readonly lastHostContentDelta: number | null
  /** 直近 handoff で close / commit が増やした host selection-only transaction 数。 */
  readonly lastHostSelectionOnlyDelta: number | null
  readonly lease: LocalImeLocalWindowPointerLeaseDiagnostics
}

export type LocalImeLocalWindowPointerHandoffHandle = {
  /** 明示 Start 成功時だけ document capture listener を張る。 */
  attach: () => void
  /** session listener だけを外す。取得済み lease は gesture 終端まで残す。 */
  detachSessionListener: () => void
  /** PUBLIC-ENTRY1のwaiting中も、同じpointer leaseでassociationだけを観測する。 */
  setProductEntryAssociationEnabled: (enabled: boolean) => void
  releaseLease: (reason: LocalImeLocalWindowPointerLeaseReleaseReason) => boolean
  releaseLeaseIfStale: () => boolean
  isGestureActive: () => boolean
  destroy: () => void
  diagnostics: () => LocalImeLocalWindowPointerHandoffDiagnostics
}

export function createLocalImeLocalWindowPointerHandoff(options: {
  getHostRoot: () => HTMLElement | null
  getDocumentIdentity: () => string
  getControllerGeneration: () => number
  getSessionActive: () => boolean
  /** controller が持つ同期 ownership eligibility。 */
  resolveHostFirst: () => LocalImeLocalWindowPointerHostFirstDecision
  /** 既存 close / commit 経路を 1 回だけ呼ぶ atomic prepare。 */
  prepareHandoff: () => { status: 'ready' | 'wait-for-composition' | 'busy-flushing' | 'recovery-required' }
  getSessionMode: () => LocalImeLocalWindowPointerSessionMode
  getHostContentTransactionCount: () => number
  getHostSelectionOnlyTransactionCount: () => number
  /** waiting中のtrusted pointerdownを初回AUTOARM associationへ渡す。Startは行わない。 */
  onProductEntryPointerAssociation?: () => boolean
  onLeaseRelease?: (notice: {
    mode: LocalImeLocalWindowPointerLeaseMode
    reason: LocalImeLocalWindowPointerLeaseReleaseReason
    stale: boolean
  }) => void
}): LocalImeLocalWindowPointerHandoffHandle {
  let sessionListenerRequested = false
  let productEntryAssociationEnabled = false
  let listenerAttached = false
  let productEntryAssociationCount = 0
  let handoffCount = 0
  let failClosedCount = 0
  let ignoredCount = 0
  let lastAction: 'ignore' | 'fail-closed' | 'handoff' | 'product-entry-association' | null = null
  let lastReason: string | null = null
  let lastCloseDurationMs: number | null = null
  let lastHostContentDelta: number | null = null
  let lastHostSelectionOnlyDelta: number | null = null

  const lease = createLocalImeLocalWindowPointerLease({
    getCurrentIdentity: () => ({
      documentIdentity: options.getDocumentIdentity(),
      controllerGeneration: options.getControllerGeneration(),
    }),
    onRelease: options.onLeaseRelease,
  })

  /**
   * host selection intent を漏らさないよう、この gesture だけを同期的に止める。
   * pointerdown の cancel だけでは `click` / `auxclick` / `contextmenu` が host へ届くので、
   * 同じ gesture の終端まで所有する suppression lease も取る（timer は使わない）。
   *
   * untrusted event は browser が続きの native sequence を生まないため lease を取らない。
   */
  const failClosed = (event: Event, pointerId: number, reason: string, trusted: boolean): void => {
    failClosedCount += 1
    lastAction = 'fail-closed'
    lastReason = reason
    if (event.cancelable) event.preventDefault()
    event.stopPropagation()
    if (!trusted) return
    lease.acquire({
      documentIdentity: options.getDocumentIdentity(),
      controllerGeneration: options.getControllerGeneration(),
      pointerId,
      mode: 'suppressed',
      downTarget: event.target,
      createGestureScope,
    })
  }

  /**
   * `click` / `dblclick` は down / up target の共通祖先へ、`contextmenu` は down target へ
   * 発火する。したがって「down target 自身かその祖先」だけを同一 gesture 由来とみなす。
   * 座標も PM position も selection endpoint も持たない target containment だけの判定である。
   * 拒否した別 pointer にも同じ factory で scope を作る。
   */
  const createGestureScope = (
    downTarget: EventTarget | null,
  ): ((candidate: EventTarget | null) => boolean) => {
    const node = downTarget instanceof Node ? downTarget : null
    return (candidate: EventTarget | null): boolean => {
      if (!(candidate instanceof Node)) return false
      if (node && (candidate === node || candidate.contains(node))) return true
      // commit 後に down target が detach した場合だけ host root 内へ緩める。
      if (node?.isConnected !== false) return false
      const hostRoot = options.getHostRoot()
      return hostRoot !== null && (candidate === hostRoot || hostRoot.contains(candidate))
    }
  }

  const targetState = (
    target: EventTarget | null,
  ): { insideHostRoot: boolean; connected: boolean } => {
    const hostRoot = options.getHostRoot()
    if (!(target instanceof Node) || !hostRoot) return { insideHostRoot: false, connected: false }
    return {
      insideHostRoot: hostRoot.isConnected && hostRoot.contains(target),
      connected: target.isConnected,
    }
  }

  const onDocumentPointerDown = (event: Event): void => {
    const pointer = event as PointerEvent
    // 1. lease へ先に通す。遮断中 gesture が live なら、この press は分類も handoff も
    //    せず捨てる（元 gesture を無防備にしない）。stale lease もこの入口で回収する。
    if (lease.noteIncomingPointerDown(pointer.pointerId, event) === 'denied') {
      ignoredCount += 1
      lastAction = 'ignore'
      lastReason = 'suppressed-gesture-active'
      return
    }
    const target = event.target
    const state = targetState(target)
    if (!options.getSessionActive()) {
      if (
        !productEntryAssociationEnabled ||
        pointer.isTrusted !== true ||
        !state.insideHostRoot ||
        !state.connected ||
        isLocalImeLocalWindowPointerDocumentActionTarget(target)
      ) {
        ignoredCount += 1
        lastAction = 'ignore'
        lastReason = !productEntryAssociationEnabled
          ? 'session-off'
          : pointer.isTrusted !== true
            ? 'not-trusted'
            : !state.insideHostRoot
              ? 'target-outside-host'
              : !state.connected
                ? 'target-detached'
                : 'document-action-control'
        return
      }
      // pointerdownはassociation hintだけ。元eventへ介入せず、実selection transactionを
      // 同じlease中に既存AUTOARMが観測し、pointerup後のproofで初めてStartできる。
      if (!lease.acquire({
        documentIdentity: options.getDocumentIdentity(),
        controllerGeneration: options.getControllerGeneration(),
        pointerId: pointer.pointerId,
        mode: 'handoff',
      })) return
      if (options.onProductEntryPointerAssociation?.() !== true) {
        lease.release('lifecycle-cancel')
        ignoredCount += 1
        lastAction = 'ignore'
        lastReason = 'product-entry-association-rejected'
        return
      }
      productEntryAssociationCount += 1
      lastAction = 'product-entry-association'
      lastReason = null
      return
    }
    const decision = resolveLocalImeLocalWindowPointerGesture({
      sessionActive: options.getSessionActive(),
      isTrusted: pointer.isTrusted === true,
      targetInsideHostRoot: state.insideHostRoot,
      targetConnected: state.connected,
      targetIsDocumentActionControl: isLocalImeLocalWindowPointerDocumentActionTarget(target),
      hostFirst: options.resolveHostFirst(),
    })
    if (decision.action === 'ignore') {
      ignoredCount += 1
      lastAction = 'ignore'
      lastReason = decision.reason
      return
    }
    if (decision.action === 'fail-closed') {
      failClosed(event, pointer.pointerId, decision.reason, pointer.isTrusted === true)
      return
    }
    // 2. 既存 close / commit 経路を同期で exact 1 回だけ呼ぶ。
    const contentBefore = options.getHostContentTransactionCount()
    const selectionOnlyBefore = options.getHostSelectionOnlyTransactionCount()
    const startedAt = performance.now()
    const preparation = options.prepareHandoff()
    lastCloseDurationMs = performance.now() - startedAt
    lastHostContentDelta = options.getHostContentTransactionCount() - contentBefore
    lastHostSelectionOnlyDelta =
      options.getHostSelectionOnlyTransactionCount() - selectionOnlyBefore
    // 3. commit 後の host DOM で、同じ target / path を再証明する。
    const afterState = targetState(target)
    const proof = resolveLocalImeLocalWindowPointerPostCloseProof({
      preparationStatus: preparation.status,
      sessionModeAfter: options.getSessionMode(),
      targetConnected: afterState.connected,
      targetInsideHostRoot: afterState.insideHostRoot,
    })
    if (!proof.continueGesture) {
      failClosed(event, pointer.pointerId, proof.reason, pointer.isTrusted === true)
      return
    }
    // 4. gesture lease を同期取得し、元の trusted event はそのまま host へ継続させる。
    lease.acquire({
      documentIdentity: options.getDocumentIdentity(),
      controllerGeneration: options.getControllerGeneration(),
      pointerId: pointer.pointerId,
      mode: 'handoff',
    })
    handoffCount += 1
    lastAction = 'handoff'
    lastReason = null
  }

  const updatePointerDownListener = (): void => {
    const required = sessionListenerRequested || productEntryAssociationEnabled
    if (required === listenerAttached) return
    if (required) document.addEventListener('pointerdown', onDocumentPointerDown, true)
    else document.removeEventListener('pointerdown', onDocumentPointerDown, true)
    listenerAttached = required
  }

  const detachSessionListener = (): void => {
    sessionListenerRequested = false
    updatePointerDownListener()
  }

  return {
    attach() {
      sessionListenerRequested = true
      updatePointerDownListener()
    },
    detachSessionListener,
    setProductEntryAssociationEnabled(enabled) {
      productEntryAssociationEnabled = enabled
      updatePointerDownListener()
    },
    releaseLease: (reason) => lease.release(reason),
    releaseLeaseIfStale: () => lease.releaseIfStale(),
    // handoff / suppressed のどちらでも gesture 進行中は Local Window を再取得しない。
    isGestureActive: () => lease.isHeld(),
    destroy() {
      sessionListenerRequested = false
      productEntryAssociationEnabled = false
      updatePointerDownListener()
      lease.destroy()
    },
    diagnostics: () => ({
      pointerdownListenerCount: listenerAttached ? 1 : 0,
      productEntryAssociationEnabled,
      productEntryAssociationCount,
      handoffCount,
      failClosedCount,
      ignoredCount,
      lastAction,
      lastReason,
      lastCloseDurationMs,
      lastHostContentDelta,
      lastHostSelectionOnlyDelta,
      lease: lease.diagnostics(),
    }),
  }
}
