/**
 * PV-COL-16: Page Viewer のページ送り visual transition (none / fade / slide / zoom)。
 *
 * PV-COL-14 の fade 専用 helper (`pageViewerPageTurnFade.ts`) を、選択された
 * 軽量 transition を再起動する pure helper へ一般化したもの。
 *
 * - session-only の Reader Control。settings.json / frontmatter / snapshot
 *   payload / IPC へは何も永続化しない (root 側で payloadId ごとに既定
 *   `fade` / `500ms` へ戻す)。
 * - CSS Columns の flow `transform` / page metrics は触らない。
 * - `none` は class を一切付けず、既存 navigation をそのまま通す。選択直後の
 *   即時 cleanup (実行中の他 mode を止める) は `clearPageTurnTransitionElements()`
 *   を呼び出し側 (root) が使う。
 *
 * **2026-07-13 第3次 follow-up (この版)**: `fade` / `slide` の視覚的な
 * mechanics を作り直した。
 *
 * - `fade`: 「page index が既に切り替わった後に fade-in するだけ」の単相
 *   から、Tategaki プラグインの paged-reading-mode 参考実装
 *   (`applySimpleTransition()`) と同じ「旧ページを fade-out → fade-out
 *   完了後に page index 切替 → 新ページを fade-in」という二相へ変更した
 *   (Tategaki のスクロール実装そのものは移植していない — fade-out →
 *   切替 → fade-in という choreography だけを踏襲)。`beginPageTurnFadeOutPhase()`
 *   / `beginPageTurnFadeInPhase()` の 2 関数へ分離し、`restartPageTurnTransitionAnimation()`
 *   はもう `fade` を扱わない (`slide` / `zoom` / `none`専用)。
 *   fade-out の完了検知は `animationend` を主信号にし、取りこぼし
 *   (要素が破棄される・タブがバックグラウンドになる等) に備えた保護付き
 *   fallback timer を従とする。呼び出し側 (root) は、より新しい遷移が
 *   fade-out の完了より先に発生した場合 (連続ページ送り・mode 変更・
 *   snapshot 差し替え・close) に備えて世代 (generation) トークンで
 *   古い完了コールバックを無効化する — この module 自身も `cancel()` を
 *   返し、`cancel()` 後は `animationend` / fallback timer のどちらが
 *   後から来ても完了コールバックを二重に呼ばない。
 * - `slide`: 半透明 overlay 単独の sweep (opacity 0→1→0 をともないながら
 *   -55%〜+55% を通過する) から、「不透明 mask + 半透明 overlay の 2 層が
 *   常に同じ方向・同じ duration で一緒に動く」choreography へ変更した。
 *   `mask` (新規要素、`--bg-surface` で塗った完全に不透明な layer) は
 *   `translateX(0%)` (画面を覆う静止位置) で開始し、`overlay` (既存の
 *   半透明 gradient) も同じ位置・同じ timing で一緒に開始する。page index
 *   の実切替は mask が完全に不透明な瞬間 (=このアニメーションが開始する
 *   瞬間、root 側の `useLayoutEffect` が DOM 更新の直後・ペイント直前に
 *   class を付けるのと同じコミットで page index も既に新しい値になって
 *   いる) に起こる。その後 mask/overlay は同じ方向・同じ duration で
 *   画面外まで一緒に退出する。stage 自体の opacity fade は完全に廃止した
 *   (slide では page-stage は一切 animate しない)。
 * - `slide` の方向 (次に進む / 前に戻る) は page index の増減
 *   (`resolvePageTurnDirection`) だけから決め、物理軸への対応付けは CSS 側
 *   (`data-page-turn-direction` × `data-writing-mode`、mask/overlay の
 *   両方に付与) が行う。**両 writing mode とも物理 x 軸のみを使う**
 *   (`PAGE_VIEWER_PAGE_TURN_SLIDE_OVERLAY_MAPPING` が方向表の正本、この
 *   follow-up でも値は変更していない)。
 *
 * `docs/page-viewer-css-columns-design-2026-07.md` §19 (fade) / §21 (transition) / §22 (この follow-up)。
 */

/** fade-out フェーズで page-stage に付与する animation class。 */
export const PAGE_VIEWER_PAGE_TURN_FADE_OUT_CLASS = 'is-page-turning-fade-out'

/** fade-in フェーズで page-stage に付与する animation class。 */
export const PAGE_VIEWER_PAGE_TURN_FADE_IN_CLASS = 'is-page-turning-fade-in'

/**
 * slide で付与する animation class。`mask`（不透明な背景層）と `overlay`
 * （半透明な紙端の影）の両方に同じ class 名を使うが、それぞれの要素の CSS
 * ルールが別の背景・見た目を定義する (transform の動きだけは共通)。
 * page-stage には一切付与しない (slide は stage を animate しない)。
 */
export const PAGE_VIEWER_PAGE_TURN_SLIDE_CLASS = 'is-page-turning-slide'

/** zoom で page-stage に付与する animation class。 */
export const PAGE_VIEWER_PAGE_TURN_ZOOM_CLASS = 'is-page-turning-zoom'

/**
 * slide の論理方向を CSS へ渡す data attribute。`mask` / `overlay` の
 * 両方に (それぞれ独立して) 付与する。見た目専用で、page index / flow
 * transform / column metrics には一切影響しない。
 */
export const PAGE_VIEWER_PAGE_TURN_DIRECTION_ATTR = 'data-page-turn-direction'

/** ページ遷移アニメーションの選択肢。 */
export type PageViewerPageTurnTransition = 'none' | 'fade' | 'slide' | 'zoom'

/** menu の表示順。 */
export const PAGE_VIEWER_PAGE_TURN_TRANSITION_OPTIONS: readonly PageViewerPageTurnTransition[] = [
  'none',
  'fade',
  'slide',
  'zoom',
]

/** 既定はこれまでと同じ意味・見た目の `fade` (PV-COL-14 互換)。 */
export const DEFAULT_PAGE_VIEWER_PAGE_TURN_TRANSITION: PageViewerPageTurnTransition = 'fade'

/** menu に出す日本語ラベル。 */
export const PAGE_VIEWER_PAGE_TURN_TRANSITION_LABELS: Record<PageViewerPageTurnTransition, string> = {
  none: 'なし',
  fade: 'フェード',
  slide: 'スライド',
  zoom: 'ズーム',
}

// --- speed (第2次 follow-up: mode ごとの固定 duration を廃止し、
//     `none` を除く全 mode 共通の runtime slider 値へ統一) ---

/** speed slider の範囲・刻み・既定値 (ms)。 */
export const PAGE_VIEWER_PAGE_TURN_SPEED_MIN_MS = 200
export const PAGE_VIEWER_PAGE_TURN_SPEED_MAX_MS = 1000
export const PAGE_VIEWER_PAGE_TURN_SPEED_STEP_MS = 50
export const DEFAULT_PAGE_VIEWER_PAGE_TURN_SPEED_MS = 500

/**
 * speed 値を 200〜1000 の範囲・50ms 刻みへ正規化する。非有限値は既定 500ms。
 * `<input type="range" step={50}>` は native 側でも刻みを丸めるが、slider
 * 以外の経路 (テスト・将来の入力経路) からも同じ規則を再利用できるよう
 * pure helper として独立させてある。
 */
export function normalizePageTurnSpeedMs(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_PAGE_VIEWER_PAGE_TURN_SPEED_MS
  const stepped = Math.round(value / PAGE_VIEWER_PAGE_TURN_SPEED_STEP_MS) * PAGE_VIEWER_PAGE_TURN_SPEED_STEP_MS
  return Math.min(Math.max(stepped, PAGE_VIEWER_PAGE_TURN_SPEED_MIN_MS), PAGE_VIEWER_PAGE_TURN_SPEED_MAX_MS)
}

/**
 * transition の実行時 duration (ms)。`none` は常に `0` (animation を起動
 * しないため、CSS/timer とも意味を持たない)。`none` 以外は正規化した speed
 * をそのまま使う — fade/slide/zoom で値を分けない (第2次 follow-up)。
 * `fade` はこの合計値をさらに `resolvePageTurnFadePhaseDurationsMs()` で
 * fade-out/fade-in の 2 フェーズへ分割する (第3次 follow-up)。
 */
export function resolvePageTurnTransitionDurationMs(
  transition: PageViewerPageTurnTransition,
  speedMs: number,
): number {
  if (transition === 'none') return 0
  return normalizePageTurnSpeedMs(speedMs)
}

/**
 * CSS 側の `animation-duration: var(--pv-page-turn-duration, ...)` と runtime
 * (JS が `style.setProperty()` する値) を必ず同じ名前で結ぶための正本。CSS に
 * 固定 ms をハードコードしない。
 */
export const PAGE_VIEWER_PAGE_TURN_DURATION_CSS_VAR = '--pv-page-turn-duration'

// --- fade の 2 フェーズ分割 (第3次 follow-up) ---

/**
 * 速度 slider の値 (= 合計 duration) のうち fade-out フェーズが占める比率。
 * 旧ページが見えたまま消えていく時間で、新ページの fade-in より短くする
 * (「フェードアウト 45%・フェードイン 55%」という依頼の例をそのまま定数化)。
 */
export const PAGE_VIEWER_PAGE_TURN_FADE_OUT_RATIO = 0.45

/** fade-in フェーズの比率。`1 - PAGE_VIEWER_PAGE_TURN_FADE_OUT_RATIO` と同じ値。 */
export const PAGE_VIEWER_PAGE_TURN_FADE_IN_RATIO = 0.55

/**
 * fade-out に取りこぼされた場合の fallback timer が、CSS の
 * `animation-duration` (=fade-out フェーズの ms) より何 ms 遅く発火するか。
 * `animationend` が正常に届けば必ずこの timer より先に完了コールバックが
 * 呼ばれるため、通常の操作では一切関与しない — 要素が非表示化される・
 * タブがバックグラウンドになるなど `animationend` 自体が届かないケースだけの
 * 安全網。
 */
export const PAGE_VIEWER_PAGE_TURN_FADE_FALLBACK_BUFFER_MS = 80

/**
 * 合計 duration (speed slider の値、`resolvePageTurnTransitionDurationMs('fade', speedMs)`
 * の戻り値) を fade-out / fade-in の 2 フェーズ ms へ分割する。端数は
 * fade-out 側を `Math.round` し、fade-in 側は残り (`total - fadeOutMs`) と
 * することで、2 フェーズの合計が常に厳密に `total` と一致する
 * (丸め誤差で「speed 200ms/500ms/1000ms のとき timer と CSS duration が
 * 一致しない」という回帰を防ぐ)。
 */
export function resolvePageTurnFadePhaseDurationsMs(totalMs: number): {
  fadeOutMs: number
  fadeInMs: number
} {
  const safeTotal = Number.isFinite(totalMs) ? Math.max(0, Math.round(totalMs)) : 0
  const fadeOutMs = Math.round(safeTotal * PAGE_VIEWER_PAGE_TURN_FADE_OUT_RATIO)
  const fadeInMs = Math.max(0, safeTotal - fadeOutMs)
  return { fadeOutMs, fadeInMs }
}

/** ページ移動の論理方向。page index の増減だけから決める (遠距離 jump も同じ)。 */
export type PageTurnDirection = 'next' | 'previous'

/**
 * 論理方向を page index の増減から決める。等しい場合は呼び出し側が
 * `shouldTriggerPageTurnTransition` で先に弾く前提だが、防御的に `next` を返す。
 */
export function resolvePageTurnDirection(
  previousPageIndex: number,
  nextPageIndex: number,
): PageTurnDirection {
  return nextPageIndex >= previousPageIndex ? 'next' : 'previous'
}

/** `slide` / `zoom` / `none` (restartPageTurnTransitionAnimation 用) の stage animation class。 */
export function pageTurnTransitionClassName(
  transition: PageViewerPageTurnTransition,
): string | null {
  switch (transition) {
    case 'slide':
      return PAGE_VIEWER_PAGE_TURN_SLIDE_CLASS
    case 'zoom':
      return PAGE_VIEWER_PAGE_TURN_ZOOM_CLASS
    default:
      return null
  }
}

/**
 * `slide` の mask/overlay が動く CSS 軸。**第2次 follow-up で物理 x 軸
 * (横方向) のみに固定した** — vertical-rl / horizontal-tb のどちらも y 軸は
 * 使わない (型自体を `'x'` のみにして、誤って y エントリを再導入することを
 * 防ぐ)。第3次 follow-up でもこの制約はそのまま。
 */
export type PageTurnSlideOverlayAxis = 'x'

/**
 * `slide` の方向表 (pure data、CSS / DOM 非依存)。**この follow-up でも値は
 * 変更していない** — mask を追加したのは CSS 側の choreography (「常に
 * `translateX(0%)` から出発し、`fromSign` の反転方向へ 100% 分だけ退出する」)
 * の話であり、方向そのものの正本は従来どおりこのテーブル。
 *
 * overlay/mask 要素自体は実際の視覚適用 (custom property の符号) を CSS 側の
 * `[data-writing-mode]` × `[data-page-turn-direction]` selector
 * (`PageViewerWindowRoot.css`) に委ねる。このテーブルは、その CSS 実装が
 * 従うべき唯一の正本であり、CSS 側の符号がここと一致することを wiring test
 * で固定する。
 *
 * **最終仕様（第2次 follow-up、旧表を置き換え）**:
 *
 * | 書字方向 | next | previous |
 * | --- | --- | --- |
 * | vertical-rl | 左 → 右 | 右 → 左 |
 * | horizontal-tb | 右 → 左 | 左 → 右 |
 *
 * `fromSign` は退出前の静止位置から見た「退出先の反対側」の符号
 * (CSS では実際の退出先 `--pv-page-turn-slide-exit-x` は `-fromSign * 100%`
 * になる — 退出方向は `fromSign` の反転)。`+` = 正方向 [右]、`-` = 負方向
 * [左]。
 */
export type PageTurnSlideOverlayMapping = {
  writingMode: 'vertical-rl' | 'horizontal-tb'
  direction: PageTurnDirection
  axis: PageTurnSlideOverlayAxis
  fromSign: 1 | -1
}

export const PAGE_VIEWER_PAGE_TURN_SLIDE_OVERLAY_MAPPING: readonly PageTurnSlideOverlayMapping[] = [
  { writingMode: 'vertical-rl', direction: 'next', axis: 'x', fromSign: -1 },
  { writingMode: 'vertical-rl', direction: 'previous', axis: 'x', fromSign: 1 },
  { writingMode: 'horizontal-tb', direction: 'next', axis: 'x', fromSign: 1 },
  { writingMode: 'horizontal-tb', direction: 'previous', axis: 'x', fromSign: -1 },
]

export type ShouldTriggerPageTurnTransitionInput = {
  /** まだ一度も page index を観測していない初期状態は `null`。 */
  previousPageIndex: number | null
  nextPageIndex: number
  /**
   * writing-mode 切替に伴う進捗復元や、文書差し替え直後など、
   * 「ユーザーのページ移動」ではない page index 変化を抑止する。
   */
  suppress: boolean
}

/**
 * 実際の global page index がユーザー操作で変わったときだけ true。
 * 初期表示 (`previousPageIndex === null`) と suppress 中は false。
 * (PV-COL-14 の `shouldTriggerPageTurnFade` と同一の判定。)
 */
export function shouldTriggerPageTurnTransition(
  input: ShouldTriggerPageTurnTransitionInput,
): boolean {
  if (input.suppress) return false
  if (input.previousPageIndex === null) return false
  if (!Number.isFinite(input.nextPageIndex) || !Number.isFinite(input.previousPageIndex)) {
    return false
  }
  return input.previousPageIndex !== input.nextPageIndex
}

/**
 * animation 対象の 3 要素。`stage` は本文表示層
 * (`.page-viewer-window__page-stage`、fade の 2 フェーズ・zoom を担う)、
 * `mask` は静止した `.page-viewer-window__page-surface` 全体を覆う不透明 layer
 * (`.page-viewer-window__transition-mask`、slide 専用)、`overlay` は同じ
 * 同じ範囲を覆う半透明 layer (`.page-viewer-window__transition-overlay`、slide
 * 専用、mask の前面)。`slide` 以外では mask/overlay に何も付与しない。
 */
export type PageTurnTransitionElements = {
  stage: HTMLElement
  mask: HTMLElement
  overlay: HTMLElement
}

/** fade の 2 フェーズ関数が対象にする要素 (page-stage のみ)。 */
export type PageTurnFadeElements = {
  stage: HTMLElement
}

const STAGE_TRANSITION_CLASSES = [
  PAGE_VIEWER_PAGE_TURN_FADE_OUT_CLASS,
  PAGE_VIEWER_PAGE_TURN_FADE_IN_CLASS,
  PAGE_VIEWER_PAGE_TURN_ZOOM_CLASS,
] as const

function clearStageTransitionClasses(stage: HTMLElement): void {
  for (const className of STAGE_TRANSITION_CLASSES) {
    stage.classList.remove(className)
  }
}

function clearSlideLayerTransitionState(layer: HTMLElement): void {
  layer.classList.remove(PAGE_VIEWER_PAGE_TURN_SLIDE_CLASS)
  layer.removeAttribute(PAGE_VIEWER_PAGE_TURN_DIRECTION_ATTR)
}

/**
 * `stage` / `mask` / `overlay` すべてから全 transition class と direction
 * attribute を取り除く。CSS custom property (`--pv-page-turn-duration`) は
 * 意図的にクリアしない — 次の restart が毎回上書きするため、消しても実害は
 * 無いが消す意味も無い (値を持たない状態と同じ既定値 fallback へ倒れるだけ)。
 *
 * `restartPageTurnTransitionAnimation()` / `beginPageTurnFadeOutPhase()` の
 * `cancel()` / `beginPageTurnFadeInPhase()` の内部 (再起動・中断・fade-in
 * 開始) だけでなく、呼び出し側 (root) が「`none` を選んだ瞬間」
 * 「snapshot replacement (`payloadId` 変更) で旧 snapshot の transition を
 * 残さない」「unmount」のために直接呼べるよう公開する。冪等 (既に何も
 * 付いていない状態へ複数回呼んでも安全)。
 * なお fade-out の**正常完了**は class を残す (opacity 0 handoff 用) —
 * この関数や cancel / fade-in 開始が除去する。
 */
export function clearPageTurnTransitionElements(elements: PageTurnTransitionElements): void {
  clearStageTransitionClasses(elements.stage)
  clearSlideLayerTransitionState(elements.mask)
  clearSlideLayerTransitionState(elements.overlay)
}

export type RestartPageTurnTransitionOptions = {
  /** `fade` はこの関数では扱わない — `beginPageTurnFadeOutPhase()` / `beginPageTurnFadeInPhase()` を使う。 */
  transition: Exclude<PageViewerPageTurnTransition, 'fade'>
  direction: PageTurnDirection
  /** ms。省略時は `DEFAULT_PAGE_VIEWER_PAGE_TURN_SPEED_MS`。 */
  speedMs?: number
}

/**
 * `slide` / `zoom` / `none` 用の単相 restart。連続ページ送りで古い animation
 * が残らないよう、`stage` / `mask` / `overlay` すべての全 transition class +
 * direction attribute を外してから付け直す (mode を跨いだ rapid navigation
 * でも前 mode の class が残らない)。`none` は何も付けず、掃除だけを行う。
 *
 * `slide` は page index が既に切り替わった**後**に呼ばれる前提 (root 側の
 * `useLayoutEffect` が pageIndex の commit と同じコミットでこの関数を呼ぶ
 * ため、mask が完全に不透明な最初のフレームでは新ページの内容が既に
 * DOM に反映されている)。`zoom` も同様に事後アニメーションのみ。
 *
 * 実行時 speed は対象要素の inline style へ `--pv-page-turn-duration` として
 * 同期的に書き込んでから class を付与するため、CSS の
 * `animation-duration: var(--pv-page-turn-duration, ...)` は必ずこの関数が
 * 計算した ms 値を使う。cleanup timer もこの同じ値を使うため、CSS
 * animation と JS timer が構造的にずれない。
 *
 * 戻り値の cleanup は timer 解除と class / attribute 除去を行う
 * (unmount / 再起動時に呼ぶ)。
 */
export function restartPageTurnTransitionAnimation(
  elements: PageTurnTransitionElements,
  options: RestartPageTurnTransitionOptions,
): () => void {
  const { stage, mask, overlay } = elements
  const durationMs = resolvePageTurnTransitionDurationMs(
    options.transition,
    options.speedMs ?? DEFAULT_PAGE_VIEWER_PAGE_TURN_SPEED_MS,
  )

  clearPageTurnTransitionElements(elements)

  const stageClassName = pageTurnTransitionClassName(options.transition)
  if (!stageClassName && options.transition !== 'slide') {
    // 'none': class を付けず、既存 navigation をそのまま通す。
    return () => {}
  }

  const durationCss = `${durationMs}ms`

  if (options.transition === 'slide') {
    mask.style.setProperty(PAGE_VIEWER_PAGE_TURN_DURATION_CSS_VAR, durationCss)
    overlay.style.setProperty(PAGE_VIEWER_PAGE_TURN_DURATION_CSS_VAR, durationCss)
    void mask.offsetWidth
    mask.setAttribute(PAGE_VIEWER_PAGE_TURN_DIRECTION_ATTR, options.direction)
    overlay.setAttribute(PAGE_VIEWER_PAGE_TURN_DIRECTION_ATTR, options.direction)
    mask.classList.add(PAGE_VIEWER_PAGE_TURN_SLIDE_CLASS)
    overlay.classList.add(PAGE_VIEWER_PAGE_TURN_SLIDE_CLASS)
  } else if (stageClassName) {
    stage.style.setProperty(PAGE_VIEWER_PAGE_TURN_DURATION_CSS_VAR, durationCss)
    void stage.offsetWidth
    stage.classList.add(stageClassName)
  }

  const timer = globalThis.setTimeout(() => {
    clearPageTurnTransitionElements(elements)
  }, durationMs)

  return () => {
    globalThis.clearTimeout(timer)
    clearPageTurnTransitionElements(elements)
  }
}

export type BeginPageTurnFadeOutOptions = {
  /** 合計 duration (speed slider の値)。ms。 */
  totalDurationMs: number
  /**
   * fade-out の完了 (`animationend` またはその fallback timer) で 1 度だけ
   * 呼ばれる。呼び出し側 (root) はここで実際の page index 切替
   * (`goToPage`) を行う想定。
   */
  onFadeOutComplete: () => void
}

/**
 * fade の第 1 フェーズ: まだ切り替わっていない (旧) ページ内容の上で
 * fade-out を開始する。完了検知は `animationend` を主信号にし、要素の破棄
 * やタブのバックグラウンド化などで event が届かない場合に備えた保護付き
 * fallback timer (`fadeOutMs + PAGE_VIEWER_PAGE_TURN_FADE_FALLBACK_BUFFER_MS`)
 * を従とする。`animationend` / fallback timer のどちらが先に来ても
 * `onFadeOutComplete` は必ず 1 度だけ呼ばれる。
 *
 * **正常完了時は fade-out class を外さない。** CSS 側は
 * `animation-fill-mode: forwards` で opacity 0 を保持し、呼び出し側が
 * `onFadeOutComplete` で page index を切り替えたあと、root の
 * `useLayoutEffect` が `beginPageTurnFadeInPhase()` を呼ぶまで stage は
 * 見えないまま handoff する。fade-out class の除去は fade-in 開始・
 * `cancel()`・`none` 選択・snapshot 差し替え・unmount 側の責務。
 *
 * 戻り値の `cancel()` はこのフェーズを中断する — より新しい遷移が
 * fade-out の完了より先に発生した場合 (連続ページ送り・mode 変更・
 * snapshot 差し替え・close) に呼び出し側が使う。`cancel()` 後は
 * `onFadeOutComplete` を一切呼ばない (page index の切替はまだ起きていない
 * ので、呼び出し側は必要なら別途 `goToPage` を直接呼んで即時反映する)。
 * `cancel()` は冪等 — 既に完了/中断済みの状態で複数回呼んでも安全。
 * 中断時だけは fade-out class を即時に除去する。
 */
export function beginPageTurnFadeOutPhase(
  elements: PageTurnFadeElements,
  options: BeginPageTurnFadeOutOptions,
): () => void {
  const { stage } = elements
  const { fadeOutMs } = resolvePageTurnFadePhaseDurationsMs(options.totalDurationMs)

  clearStageTransitionClasses(stage)
  stage.style.setProperty(PAGE_VIEWER_PAGE_TURN_DURATION_CSS_VAR, `${fadeOutMs}ms`)

  let settled = false

  const handleAnimationEnd = (event: Event) => {
    const target = (event as { target?: unknown }).target
    if (target !== stage) return
    finishAsComplete()
  }

  const finishAsComplete = () => {
    if (settled) return
    settled = true
    stage.removeEventListener('animationend', handleAnimationEnd)
    globalThis.clearTimeout(fallbackTimer)
    // 正常完了: listener / timer だけ掃除し、fade-out class は残す。
    // CSS の `forwards` が opacity 0 を保持したまま page index 切替 →
    // useLayoutEffect 内の fade-in 開始まで handoff する。ここで class を
    // 外すと forwards が効かなくなり、一瞬 opacity 1 へ戻ってちらつく。
    options.onFadeOutComplete()
  }

  const fallbackTimer = globalThis.setTimeout(
    finishAsComplete,
    fadeOutMs + PAGE_VIEWER_PAGE_TURN_FADE_FALLBACK_BUFFER_MS,
  )

  stage.addEventListener('animationend', handleAnimationEnd)

  void stage.offsetWidth
  stage.classList.add(PAGE_VIEWER_PAGE_TURN_FADE_OUT_CLASS)

  return () => {
    if (settled) return
    settled = true
    stage.removeEventListener('animationend', handleAnimationEnd)
    globalThis.clearTimeout(fallbackTimer)
    // 完了コールバックは呼ばない — これは中断であって完了ではない。中断時は
    // 進行中だった fade-out の視覚状態 (class) を即時に取り除く。呼び出し側
    // (root) の各 cleanup effect は既に `clearPageTurnTransitionElements()`
    // を別途呼んでいるが、`cancel()` 単体でも自己完結して安全な状態に戻る。
    clearStageTransitionClasses(stage)
  }
}

export type BeginPageTurnFadeInOptions = {
  /** 合計 duration (speed slider の値)。ms。fade-out と同じ値を渡す。 */
  totalDurationMs: number
}

/**
 * fade の第 2 フェーズ: 既に切り替わった (新) ページ内容の上で fade-in を
 * 開始する。呼び出し時点では fade-out class が `forwards` で opacity 0 を
 * 保持したまま残っている想定で、ここで一括除去 → reflow → fade-in class
 * 付与する (root の `useLayoutEffect` 内なので途中の opacity 1 は paint
 * されない)。この後に続くフェーズは無いため、`slide`/`zoom` と同じ単相
 * パターン (自身の cleanup timer で class を外す) を使う。戻り値の cleanup
 * は timer 解除と class 除去を行う。
 */
export function beginPageTurnFadeInPhase(
  elements: PageTurnFadeElements,
  options: BeginPageTurnFadeInOptions,
): () => void {
  const { stage } = elements
  const { fadeInMs } = resolvePageTurnFadePhaseDurationsMs(options.totalDurationMs)

  // 正常 handoff: 残っている fade-out class (opacity 0 / forwards) をここで
  // 外し、同じ同期ブロック内で fade-in へ置き換える。
  clearStageTransitionClasses(stage)
  stage.style.setProperty(PAGE_VIEWER_PAGE_TURN_DURATION_CSS_VAR, `${fadeInMs}ms`)
  void stage.offsetWidth
  stage.classList.add(PAGE_VIEWER_PAGE_TURN_FADE_IN_CLASS)

  const timer = globalThis.setTimeout(() => {
    clearStageTransitionClasses(stage)
  }, fadeInMs)

  return () => {
    globalThis.clearTimeout(timer)
    clearStageTransitionClasses(stage)
  }
}

/** `prefers-reduced-motion: reduce` のとき transition を起動しない。 */
export function prefersReducedMotion(
  matchMedia: ((query: string) => { matches: boolean }) | undefined = typeof window !== 'undefined'
    ? window.matchMedia.bind(window)
    : undefined,
): boolean {
  if (!matchMedia) return false
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}
