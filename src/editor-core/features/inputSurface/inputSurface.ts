import type { CommitTargetRestriction, EditOwner, OwnerCommitReceipt, OwnerInsertionSnapshot, OwnerPreeditContext } from './editOwner'
import { isSurfaceInputAllowed, shouldClearSurfaceFailure, shouldNormalizeEmptySurface } from './surfaceState'
import { surfacePlacement } from './surfacePlacement'
import { surfaceBlockPlacement, surfaceFollowStart, type SurfaceFrozenPlacement } from './surfacePlacement'
import { createSurfaceTypography } from './surfaceTypography'
import { createPreeditHighlight } from './preeditHighlight'
import { createRetainedDisplay } from './retainedDisplay'
import { hasCanonicalEmptySurfaceCaret } from './emptySurfaceCaret'
import { readContentOrigin, rightFromContentLineEnd, toContentLeft, toContentRect, toContentRight, toContentTop } from './contentCoordinates'
import { createSelectionMirrorController } from './selectionMirrorController'
import type { SelectionMirror } from './selectionMirror'
import { isMirrorNavigationKey } from './compositionIntent'
import { readInputSurfaceAccessibleName, readInputSurfacePreeditDisplay, shouldPresentCompositionAtStart, subscribeInputSurfaceAccessibleName } from './surfacePreferences'

export type SurfaceRecord = (kind: string, detail?: Record<string, unknown>) => void
type RetainedAtCompositionStart = {
  kind: 'retained'
  text: string
  failure: Exclude<OwnerCommitReceipt, 'committed'> | null
}

/** INLINE-2: 前後の文脈。規則は固定（styles.css）で、cycleごとに変えるのは入力面自身の属性と変数だけ。 */
const CONTEXT_ATTRIBUTE = 'data-nyoze-preedit-context'
const CONTEXT_ATTRIBUTES = [CONTEXT_ATTRIBUTE, `${CONTEXT_ATTRIBUTE}-before`, `${CONTEXT_ATTRIBUTE}-after`] as const
const CONTEXT_VARIABLES = ['--nyoze-preedit-context-indent', '--nyoze-preedit-context-offset', '--nyoze-preedit-context-wrap'] as const

/** CEの内容・composition・selectionはこのmoduleだけが扱う。 */
export function createInputSurface(options: {
  host: HTMLElement
  /**
   * 入力面の親。scrollするhostで、`revealCaret`がscrollするのと同じ要素（`resolvePageUpDownScrollHost`）。
   * 見つからないときの代わりの親は持たない（呼ぶ側が生成の失敗として扱う）。
   */
  scrollHost: HTMLElement
  currentOwner(): EditOwner
  maySetCaret(): boolean
  mayMirror?(): boolean
  onCommit(): void
  onBeforeInput?(event: InputEvent): void
  onCompositionFinished?(): void
  onStateChange?(): void
  onDisplayChange?(): void
  /**
   * BLOCK-WARN1: 確定先の位置だけで確定が拒否されると、打つ前に分かった。直接入力はbeforeinputで止めた後、
   * 変換はcompositionstartで（変換は止めない）。表示は受け手が持つ。
   */
  onInputRestricted?(restriction: CommitTargetRestriction, via: 'direct' | 'composition'): void
  record: SurfaceRecord
}) {
  const { host, scrollHost, record } = options
  const doc = host.ownerDocument, win = doc.defaultView!
  const element = doc.createElement('div')
  element.dataset.nyozeInputSurface = 'true'
  element.setAttribute('contenteditable', 'plaintext-only')
  element.setAttribute('spellcheck', 'false')
  element.setAttribute('role', 'textbox')
  // ENTRY-UI1: 名前はUIが表示の言語に合わせて渡す（`surfacePreferences.ts`）。言語を変えたら、その場で書き直す。
  const applyAccessibleName = () => element.setAttribute('aria-label', readInputSurfaceAccessibleName())
  applyAccessibleName()
  const unsubscribeAccessibleName = subscribeInputSurfaceAccessibleName(applyAccessibleName)
  Object.assign(element.style, {
    // pseudo overlay(20)より下、本文／current-line bandより上に描く。
    // preeditの不透明Highlightがcaretの内側半分を覆わないようにする。
    // PIS-S10-PREEDIT-FOLLOW1: scrollするhostの子の絶対配置（内容の座標）。変換中のscrollへの追従はブラウザに任せる。
    position: 'absolute', left: '0px', top: '0px', zIndex: '19',
    margin: '0', padding: '0', border: '0', outline: '0',
    minWidth: '1em', minHeight: '1em', whiteSpace: 'pre', boxSizing: 'content-box', overflow: 'visible',
    backgroundColor: 'transparent',
    pointerEvents: 'none',
    // 末尾の最大のscrollの位置で、入力面の大きさ・位置が変わるとChromiumがscrollを補正して、最初の変換の更新で
    // 余分なscrollが出る（scroll anchoring）。入力面を対象から外す（`.editor-surface`の既存の挙動は変えない）。
    overflowAnchor: 'none',
    // ブラウザ自身のcaret reveal（変換中・直接入力）が、PMのreveal（外へ出たときだけ5 px）と同じ余白で着地する。
    scrollMargin: '5px',
  })
  // 作成時に1回だけ置き、editorの破棄まで同じ親・同じ要素のままにする。変換中・mode / owner変更では、
  // 親・position・displayを変えず、appendChild / insertBefore / removeもしない。
  scrollHost.appendChild(element)
  const preedit = createPreeditHighlight(element)
  let composing = false
  let discarding = false
  // 現在の変換の番号（開始のたびに進む）と、その開始の時点で入力面に文字（保持文字）があったか。
  let compositionCycle = 0
  let retainedAtCompositionStart = false
  // 拒否cycleの文字と、開始前から失敗して保持している文字を混ぜない。
  let retainedStart: RetainedAtCompositionStart | null = null
  let committing = false
  let compositionSnapshot: OwnerInsertionSnapshot | null = null
  let insertionSnapshot: OwnerInsertionSnapshot | null = null
  let failure: Exclude<OwnerCommitReceipt, 'committed'> | null = null
  let enabled = true
  let presentationOwner: EditOwner | null = null
  let contextApplied = false
  // INLINE-2B: 配置の凍結時の、入力面のinline方向の起点と行の大きさ（textblockへ配置した場合だけ）。
  let placement: SurfaceFrozenPlacement | null = null
  // 追従で書き換えた開始位置の、凍結時の値。追従していなければnull。
  let frozenStart: { textIndent: string; top: string; right: string } | null = null
  let followedText: string | null = null
  // 折り返しの位置で行末側に表示されたcaretから始めたcycleは、caretの位置から始める契約（S3）を保ち、追従しない。
  let followAllowed = false
  const content = createSelectionMirrorController({ element, currentOwner: options.currentOwner, mayMirror: () => options.mayMirror?.() ?? false, canNotify: () => enabled && !composing && !committing && !failure, record })
  const { text, rawText } = content
  // PIS-RETAINED-TEXT-COLOR1: 保持文字の表示（属性）。付け外しはこの1つで決め、`failure`の代入ごとには付け外ししない。
  // 出来事の途中（文字が入力面に入ってからownerへ確定するまで）の状態では合わせない。入口（event handlerと外へ出すAPI）を
  // `settleRetained`で包み、抜けるときに1回だけ合わせる。途中で合わせると、成功する入力の1打ごとに属性が付いて外れる。
  const retainedDisplay = createRetainedDisplay(element, () => ({ kind: content.kind(), text: text(), composing, failure }))
  let entryDepth = 0
  const settleRetained = <T>(run: () => T): T => {
    entryDepth++
    try { return run() } finally { if (--entryDepth === 0) retainedDisplay.refresh() }
  }
  /** 内容の座標の原点（親の矩形・clientのinset・scroll量）を読む。書き込みの前に、ほかの読み取りと一緒に呼ぶ。 */
  const contentOrigin = () => readContentOrigin(scrollHost)

  const restoreFrozenStart = () => {
    followedText = null
    if (!frozenStart) return
    element.style.textIndent = frozenStart.textIndent
    element.style.top = frozenStart.top
    element.style.right = frozenStart.right
    frozenStart = null
  }
  /**
   * INLINE-2B: 文脈を持てないcycleで、入力面の開始位置だけをownerの予約領域の最初の文字へ合わせる。
   * 組版・scroll・revealは凍結のまま。ownerが行を組み直して前の文字が動いても、入力中の文字が前の文字へ重ならない。
   * 入力面の文字が変わったときだけ、予約領域のDOMを書いた後に1回読む。書くのは入力面自身のstyleだけ。
   */
  const followPresentation = () => {
    const current = text()
    if (!composing || !followAllowed || contextApplied || !placement || !current || !presentationOwner?.isCompositionPresented?.()) {
      // 空の間、予約領域が消えた後は、凍結時の位置へ戻す。
      restoreFrozenStart()
      return
    }
    if (current === followedText) return
    const rect = presentationOwner.compositionPresentationRect?.() ?? null
    // 読めない場合は何もしない。
    if (!rect) return
    followedText = current
    frozenStart ??= { textIndent: element.style.textIndent, top: element.style.top, right: element.style.right }
    // 予約領域の矩形を読んだ直後、書き込みの前に、内容の座標の原点を読む。凍結時の`inlineStart`も内容の座標なので、
    // 変換中にscrollしても（どちらの軸でも）開始位置の計算はずれない。
    const origin = contentOrigin()
    const start = surfaceFollowStart(toContentRect(origin, rect), placement)
    element.style.textIndent = `${start.indent}px`
    if (placement.vertical) element.style.right = `${rightFromContentLineEnd(origin, start.lineEnd)}px`
    else element.style.top = `${start.lineStart}px`
  }

  const clearContext = () => {
    if (!contextApplied) return
    contextApplied = false
    for (const name of CONTEXT_ATTRIBUTES) element.removeAttribute(name)
    for (const name of CONTEXT_VARIABLES) element.style.removeProperty(name)
  }
  const applyContext = (context: OwnerPreeditContext | null) => {
    // 線を引く書式は、透明な文脈の下にも線が出るので対象外（従来の表示のまま）。
    const decoration = element.style.getPropertyValue('text-decoration-line')
    if (!context || (decoration && decoration !== 'none')) return
    element.setAttribute(`${CONTEXT_ATTRIBUTE}-before`, context.before)
    element.setAttribute(`${CONTEXT_ATTRIBUTE}-after`, context.after)
    element.style.setProperty('--nyoze-preedit-context-indent', context.indent)
    element.style.setProperty('--nyoze-preedit-context-offset', `${-context.blockOffset}px`)
    element.style.setProperty('--nyoze-preedit-context-wrap', context.textWrap)
    element.setAttribute(CONTEXT_ATTRIBUTE, 'true')
    contextApplied = true
    record('preedit-context', { before: context.before.length, after: context.after.length, blockOffset: context.blockOffset })
  }

  /**
   * 変換中の文字の背景を塗るか（PIS-S10-CURRENT-LINE2 (b)）。Hostに予約領域が出ている間（押し出しの表示）は塗らない。
   * 予約領域のない表示（範囲の変換、保持文字、予約領域が置けなかった・消えたcycle）は、不透明な塗りで本文へ重ねる。
   */
  const preeditPainted = () => content.kind() !== 'mirror' && !(composing && presentationOwner?.isCompositionPresented?.() === true)
  /** 再変換の押し出し表示の同期の事実。DOMの選択やtimerから推測しない。 */
  const isReconversionPresented = () => composing && content.isReconversion() && presentationOwner?.isCompositionPresented?.() === true
  const refreshPreeditPaint = () => {
    const hideSelection = isReconversionPresented()
    // native IMEの下線/文節には触れず、DOM Selectionの塗りだけを固定CSSで切り替える。
    const attribute = 'data-nyoze-reconversion-selection-hidden'
    if (element.hasAttribute(attribute) !== hideSelection) element.toggleAttribute(attribute, hideSelection)
    preedit.update(preeditPainted())
  }
  const visual = () => {
    // 方式A: 見える字とnative IME表示は、cycleの有無によらず入力面が描く。背景は、本文へ重ねる表示でだけ塗る。
    refreshPreeditPaint()
    // 入口の外（外から呼ばれた配置の書き込みなど）では、落ち着いた状態なのでその場で合わせる。
    if (entryDepth === 0) retainedDisplay.refresh()
    element.style.opacity = content.kind() === 'mirror' ? '0' : enabled || text() ? '1' : '0'
    options.onDisplayChange?.()
  }
  const endCompositionPresentation = () => {
    clearContext()
    restoreFrozenStart()
    followAllowed = false
    const previous = presentationOwner
    presentationOwner = null
    previous?.presentComposition?.(null)
    visual()
  }
  const updateCompositionPresentation = () => {
    if (presentationOwner && presentationOwner !== options.currentOwner()) endCompositionPresentation()
    if (composing) presentationOwner?.presentComposition?.(text())
    // 予約領域が外部の本文変更で消えた後は、従来の重ねる表示へ戻す。
    if (contextApplied && !presentationOwner?.isCompositionPresented?.()) clearContext()
    followPresentation()
  }
  const setEmptyCaret = () => {
    if (composing || rawText() || doc.activeElement !== element || !options.maySetCaret()) return
    const selection = doc.getSelection()
    // Removing the committed text already relocates its live Range here.
    // Do not clear/re-add that canonical caret after dirtying Host layout.
    if (hasCanonicalEmptySurfaceCaret(element, selection)) return
    const range = doc.createRange()
    range.setStart(element, 0)
    range.collapse(true)
    selection?.removeAllRanges()
    selection?.addRange(range)
  }
  const normalize = () => {
    if (content.kind() === 'mirror' || !shouldNormalizeEmptySurface(composing, text())) return
    if (element.childNodes.length) element.replaceChildren()
    setEmptyCaret()
    visual()
  }
  const readTypography = createSurfaceTypography({ host, element, currentOwner: options.currentOwner, preedit, record, visual })
  const refreshTypography = (force = false) => { if (!composing) readTypography(force) }
  const preparePlacement = (forceTypography = false): (() => void) | null => {
    // composition中は入力面のgeometryも安定させる（S7で表示を統合）。
    if (composing) return null
    // 新しい配置を書くので、追従の前の値へは戻さない。
    frozenStart = null
    followedText = null
    placement = null
    const owner = options.currentOwner(), rect = owner.insertionCaretRect()
    const writeMirror = content.prepare(enabled && !committing && !failure && !!rect)
    const block = owner.insertionTextblock()
    const style = block ? win.getComputedStyle(block) : null
    const box = block?.getBoundingClientRect()
    // 内容の座標の原点もここで読む（書き込みの前にすべての読み取りを終える）。
    const origin = contentOrigin()
    const px = (property: string) => parseFloat(style?.getPropertyValue(property) ?? '') || 0
    const edges = {
      left: px('border-left-width') + px('padding-left'), right: px('border-right-width') + px('padding-right'),
      top: px('border-top-width') + px('padding-top'), bottom: px('border-bottom-width') + px('padding-bottom'),
    }
    // Host geometry is independent of receiver typography. Finish these reads
    // before writing receiver styles, then use the newly copied typography.
    refreshTypography(forceTypography)
    if (!rect) { record('caret-unavailable'); return () => { if (writeMirror()) visual() } }
    const vertical = element.style.writingMode.startsWith('vertical')
    const lineHeight = parseFloat(element.style.lineHeight)
    const size = Number.isFinite(lineHeight) ? lineHeight : parseFloat(element.style.fontSize)
    if (!block) {
      const position = surfacePlacement(rect, size, vertical)
      return () => {
        element.style.inlineSize = 'auto'; element.style.blockSize = 'auto'; element.style.textIndent = '0px'
        element.style.right = 'auto'; element.style.left = `${toContentLeft(origin, position.left)}px`; element.style.top = `${toContentTop(origin, position.top)}px`
        if (writeMirror()) visual()
        options.onDisplayChange?.()
      }
    }
    const position = surfaceBlockPlacement(rect, box!, edges, size, vertical)
    const right = toContentRight(origin, position.firstLineEnd)
    return () => {
      placement = { vertical, inlineStart: vertical ? toContentTop(origin, position.top) : toContentLeft(origin, position.left), size }
      element.style.textIndent = `${position.indent}px`
      element.style.inlineSize = `${position.inlineSize}px`
      element.style.blockSize = `${size}px`
      element.style.top = `${toContentTop(origin, position.top)}px`
      if (vertical) { element.style.left = 'auto'; element.style.right = `${right}px` }
      else { element.style.right = 'auto'; element.style.left = `${toContentLeft(origin, position.left)}px` }
      record('placed', { vertical, inlineSize: position.inlineSize, indent: position.indent })
      if (writeMirror()) visual()
      options.onDisplayChange?.()
    }
  }
  const place = (forceTypography = false) => settleRetained(() => preparePlacement(forceTypography)?.())
  // dataをpayloadの正本にしても、同じDOMを作り直さない（IMEのcaretを保つ）。
  const replacePayloadIfDifferent = (payload: string) => {
    if (rawText() === payload) return
    element.replaceChildren(...(payload ? [doc.createTextNode(payload)] : []))
    if (!payload || doc.activeElement !== element) return
    const range = doc.createRange()
    range.setStart(element.firstChild!, payload.length)
    range.collapse(true)
    const selection = doc.getSelection()
    selection?.removeAllRanges(); selection?.addRange(range)
  }
  /** 戻り値はownerが`'committed'`を返したか（KEYLESS-CONTINUATION1の確定の直後の印の始め方）。 */
  const commit = (payload: string, snapshot: OwnerInsertionSnapshot | null, via: string, original: SelectionMirror | null = null): boolean => {
    if (!payload) { endCompositionPresentation(); normalize(); options.onStateChange?.(); return false }
    // S6以前も保持済み文字を新snapshotへ黙って適用し直さない。
    let result: OwnerCommitReceipt
    committing = true
    try { result = failure ?? (snapshot ? options.currentOwner().commitText(snapshot, payload, original) : 'stale') }
    finally { endCompositionPresentation(); committing = false }
    // 変換を伴わない直接入力は、Hostがbeforeinputで黙って捨てる場面（TCYの保護）では保持せずに捨てる。
    // ほかの理由の拒否と、compositionの確定の拒否は、従来どおり保持する。
    if (result === 'protected-target' && via === 'insertText' && !failure) {
      record('owner-commit-dropped', { via, text: payload, from: snapshot?.from, to: snapshot?.to })
      element.replaceChildren()
      content.empty()
      compositionSnapshot = insertionSnapshot = null
      normalize()
      options.onStateChange?.()
      return false
    }
    record(result === 'committed' ? 'commit' : result, { via, text: payload, from: snapshot?.from, to: snapshot?.to })
    if (result !== 'committed') {
      failure = result
      content.retained()
      if (result === 'newline-in-payload' && text() !== payload) element.textContent = payload
      visual()
      options.onStateChange?.()
      return false
    }
    element.replaceChildren()
    content.empty()
    compositionSnapshot = insertionSnapshot = null
    normalize()
    options.onStateChange?.()
    if (via === 'insertText') content.noteInputFinished({ committed: true })
    options.onCommit()
    return true
  }
  const onStart = (event: CompositionEvent) => settleRetained(() => {
    const startSnapshot = options.currentOwner().snapshotInsertion()
    if (!composing) retainedStart = content.kind() !== 'mirror' && text()
      ? { kind: 'retained', text: text(), failure } : null
    // 配置はDOMの選択を変え得る。D6はその前のnative selectionを照合する。
    retainedAtCompositionStart = content.begin(startSnapshot, event.data)
    const started = performance.now(), revealed = options.currentOwner().revealInsertionPosition()
    place(true)
    record('compositionstart-placement', { durationMs: performance.now() - started, revealed })
    // 前cycleの表示文字を持ち越さない。
    endCompositionPresentation()
    // BLOCK-WARN1: 確定先が拒否される位置なら、変換の開始で知らせる（変換は止めない。確定した文字は従来どおり入力面に保持される）。
    const startRestriction = startSnapshot && options.currentOwner().resolveCommitTargetRestriction?.(startSnapshot)
    if (startRestriction) { record('composition-target-restricted', { restriction: startRestriction, from: startSnapshot!.from, to: startSnapshot!.to }); options.onInputRestricted?.(startRestriction, 'composition') }
    composing = true
    discarding = false
    compositionCycle++
    // 変換の開始の時点の文字は、確定に失敗して保持している文字（`failure`の有無によらない）。
    if (!failure) compositionSnapshot = startSnapshot
    insertionSnapshot = null
    // PREEDIT-DISPLAY1: 押し出すか重ねるかは、この時点の設定で決め、この変換の間は変えない（予約領域はここでだけ置く）。
    if (enabled && !failure && compositionSnapshot && shouldPresentCompositionAtStart({
      preeditDisplay: readInputSurfacePreeditDisplay(),
      collapsed: compositionSnapshot.from === compositionSnapshot.to,
      reconversion: content.isReconversion(),
    })) {
      const owner = options.currentOwner()
      if (owner.proveSnapshot(compositionSnapshot)) {
        // 配置と同じ凍結時に1回だけ、予約領域を置く前のlayoutから文脈を読む。
        const contextStarted = performance.now()
        const range = compositionSnapshot.from !== compositionSnapshot.to
        const atWrapEnd = !range && (owner.insertionCaretAtWrapEnd?.() ?? false)
        followAllowed = !atWrapEnd
        const context = range || atWrapEnd ? null : owner.insertionPreeditContext?.() ?? null
        record('preedit-context-resolved', { durationMs: performance.now() - contextStarted, resolved: !!context })
        presentationOwner = owner
        owner.presentComposition?.(range ? rawText() : '', compositionSnapshot)
        if (owner.isCompositionPresented?.()) applyContext(context)
      }
    }
    // 開始可否にかかわらず入力面は従来どおり見せる。
    visual()
    record('compositionstart', { data: event.data, from: compositionSnapshot?.from, to: compositionSnapshot?.to, identity: compositionSnapshot?.identity })
    options.onStateChange?.()
  })
  const onUpdate = () => settleRetained(() => { updateCompositionPresentation(); visual() })
  const onEnd = (event: CompositionEvent) => settleRetained(() => {
    composing = false
    const previousRetained = retainedStart
    retainedStart = null
    record('compositionend', { data: event.data })
    if (discarding) {
      // E4: 利用者が確認して破棄した変換の、遅れて届いた終了。確定しない・保持しない。
      discarding = false
      element.replaceChildren()
      content.empty()
      compositionSnapshot = insertionSnapshot = null
      if (!enabled) element.contentEditable = 'false'
      content.noteInputFinished({ committed: false })
      record('compositionend-after-discard', { data: event.data })
      visual()
      options.onStateChange?.()
      return
    }
    // Chromiumはend前に文字を消すことがある。空endではplaceholderも除去する。
    const reconversion = content.end(compositionSnapshot, event.data)
    const payload = reconversion ? reconversion.payload : /[\n\r]/.test(event.data) ? event.data : text() || event.data || ''
    const restoreRetained = reconversion?.reason ? previousRetained : null
    let committed = false
    if (restoreRetained) {
      replacePayloadIfDifferent(restoreRetained.text)
      failure = restoreRetained.failure
      content.restoreRetained()
      endCompositionPresentation()
      record('composition-rejection-restored-retained', { reason: reconversion?.reason, text: restoreRetained.text, failure })
    } else {
      if (reconversion) replacePayloadIfDifferent(payload)
      if (!text() && payload) element.textContent = payload
      if (reconversion?.retain) {
        failure = 'dispatch-rejected'
        content.retained()
        endCompositionPresentation()
        record('composition-payload-retained', { reason: reconversion.reason, text: payload })
      } else committed = commit(payload, reconversion?.snapshot ?? compositionSnapshot, 'compositionend', reconversion?.original)
    }
    content.noteInputFinished({ committed })
    if (!payload && !restoreRetained) compositionSnapshot = null
    if (!enabled) element.contentEditable = 'false'
    visual()
    options.onStateChange?.()
    options.onCompositionFinished?.()
  })
  const onBeforeInput = (event: InputEvent) => {
    record('beforeinput', { inputType: event.inputType, data: event.data, composing: event.isComposing })
    if (content.kind() === 'mirror' && !composing && !event.isComposing && event.inputType.startsWith('delete')) {
      event.preventDefault(); content.rejectDeletion(); insertionSnapshot = null
      return
    }
    if (!isSurfaceInputAllowed(event.inputType, composing || event.isComposing, !!text())) {
      event.preventDefault()
      insertionSnapshot = null
      record('beforeinput-blocked', { inputType: event.inputType })
      return
    }
    const direct = !composing && !event.isComposing && event.inputType === 'insertText'
    if (direct) {
      insertionSnapshot = options.currentOwner().snapshotInsertion()
      // BLOCK-WARN1: 確定先が拒否される位置の直接入力は、入力面へ入る前に止めて知らせる（文字は本文にも入力面にも入らない）。
      // 入力面に保持文字があるときは、確定を試みない（保持文字へ続く）ので、止めない。判定は`commitText`と同じ1つの関数。
      const restriction = insertionSnapshot && !failure && (content.kind() === 'mirror' || !text())
        ? options.currentOwner().resolveCommitTargetRestriction?.(insertionSnapshot) : null
      if (restriction) {
        event.preventDefault()
        record('beforeinput-blocked', { inputType: event.inputType, restriction, from: insertionSnapshot!.from, to: insertionSnapshot!.to })
        // snapshotは捨てない。止めた後に`input`は来ないが、来た場合（合成eventなど）は、確定の`protected-target`が
        // 安全網として文字を捨てる（`commit()`）。捨てると`stale`として入力欄に保持される。次のbeforeinputで取り直す。
        options.onInputRestricted?.(restriction, 'direct')
        return
      }
    }
    options.onBeforeInput?.(event)
  }
  const onInput = (rawEvent: Event) => settleRetained(() => {
    const event = rawEvent as InputEvent
    updateCompositionPresentation()
    visual()
    record('input', { inputType: event.inputType, data: event.data, composing: event.isComposing })
    if (shouldClearSurfaceFailure(failure !== null, composing || event.isComposing, text())) {
      const previous = failure
      failure = compositionSnapshot = insertionSnapshot = null
      content.empty()
      record('failure-cleared-by-user', { previous })
    }
    if (!composing && !event.isComposing && event.inputType === 'insertText') {
      const direct = content.direct(event.data)
      if (direct) {
        replacePayloadIfDifferent(direct.payload)
        commit(direct.payload, insertionSnapshot, 'insertText')
      } else if (text()) commit(event.data && /[\n\r]/.test(event.data) ? event.data : text(), insertionSnapshot, 'insertText')
      insertionSnapshot = null
    }
    if (!composing && text()) content.retained()
    normalize()
    options.onStateChange?.()
  })
  element.addEventListener('compositionstart', onStart)
  element.addEventListener('compositionupdate', onUpdate)
  element.addEventListener('compositionend', onEnd)
  element.addEventListener('beforeinput', onBeforeInput)
  element.addEventListener('input', onInput)
  const onKeyDown = (event: KeyboardEvent) => settleRetained(() => {
    content.beforeKey(event)
    const navigation = isMirrorNavigationKey(event.key)
    if (navigation) content.holdNavigation()
    const dirty = !navigation && content.releaseNavigation()
    const released = !event.isComposing && content.releaseRejection()
    if (!composing && (dirty || released) && !navigation) place()
    content.noteKey(event)
  })
  const onKeyUp = (event: KeyboardEvent) => settleRetained(() => {
    content.noteKeyUp(event)
    if (content.releaseNavigation() && !composing && !committing) place()
  })
  const onPointer = () => settleRetained(() => { content.releaseNavigation(); content.invalidate(); visual() })
  element.addEventListener('keydown', onKeyDown)
  element.addEventListener('keyup', onKeyUp)
  host.addEventListener('pointerdown', onPointer, true)
  refreshTypography()

  return {
    element, text, rawText, place, preparePlacement, refreshTypography, endCompositionPresentation, isReconversionPresented,
    contentState: content.snapshot,
    resumeMirror: content.releaseNavigation,
    withDeferredMirrorWrite: content.withDeferredWrites,
    invalidateMirror: () => settleRetained(() => { content.invalidate(); visual() }),
    /** 予約領域の有無が、入力面のeventの外（本文の変更）で変わったときに、背景の塗りを合わせる。読み取りなし。 */
    refreshPreeditPaint,
    isComposing: () => composing,
    /** 変換中だけ: 変換の番号と、E4で破棄できるか（開始の時点で保持文字がなかったか）。 */
    compositionState: () => composing ? { cycle: compositionCycle, discardable: !committing && !retainedAtCompositionStart } : null,
    isCommitting: () => committing,
    failure: () => failure,
    discardRetained: () => settleRetained(() => {
      if (composing || committing || !text()) return false
      element.replaceChildren()
      content.empty()
      failure = compositionSnapshot = insertionSnapshot = null
      normalize()
      record('retained-discarded-by-user')
      options.onStateChange?.()
      return true
    }),
    /**
     * E4: 変換が終わらないときの逃げ道。利用者の確認の後だけ呼ぶ。変換中の文字を捨て、
     * この後に届く`compositionend`でも確定しない。Hostへ確定しない・再適用しない。
     */
    discardComposition: () => settleRetained(() => {
      // 保持文字と同居している変換は破棄しない（保持文字を、確認の文にないまま消さない）。
      if (!composing || committing || retainedAtCompositionStart) return false
      discarding = true
      endCompositionPresentation()
      element.replaceChildren()
      composing = false
      failure = compositionSnapshot = insertionSnapshot = null
      content.invalidate(); content.empty()
      record('composition-discarded-by-user')
      options.onStateChange?.()
      return true
    }),
    focus: () => settleRetained(() => {
      if (!enabled || composing) return false
      content.releaseNavigation()
      place()
      element.focus({ preventScroll: true })
      normalize()
      return doc.activeElement === element
    }),
    setEnabled: (value: boolean) => settleRetained(() => {
      if (!value) endCompositionPresentation()
      if (!value) { content.releaseNavigation(); content.invalidate() }
      if (value === enabled) return
      enabled = value
      if (!composing) element.contentEditable = value ? 'plaintext-only' : 'false'
      visual()
    }),
    destroy() {
      retainedStart = null
      unsubscribeAccessibleName()
      content.destroy()
      endCompositionPresentation()
      element.removeEventListener('compositionstart', onStart)
      element.removeEventListener('compositionupdate', onUpdate)
      element.removeEventListener('compositionend', onEnd)
      element.removeEventListener('beforeinput', onBeforeInput)
      element.removeEventListener('input', onInput)
      element.removeEventListener('keydown', onKeyDown)
      element.removeEventListener('keyup', onKeyUp)
      host.removeEventListener('pointerdown', onPointer, true)
      element.remove()
      preedit.destroy()
    },
  }
}
export type InputSurface = ReturnType<typeof createInputSurface>
