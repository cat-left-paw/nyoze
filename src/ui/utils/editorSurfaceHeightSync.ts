/**
 * EDITOR-VERTICAL-LAYOUT-FIX1 / STYLE1 / ANCHOR1: panel の content box の高さを px で外枠
 * `.editor-surface-frame` の `style.height` へ写す。
 *
 * 縦書きでは `.editor-surface` が書字方向の直交する root で、その高さの基準が flex / grid の連鎖で
 * 決まると、Chromium は祖先の layout のたびに全段落を組み直す（35万字で 1 回 35〜45 ms。診断:
 * docs/pis/s8-vertical-layout-diag.md）。基準を px で明示すると段落の layout result が再利用され、
 * 1〜3 ms になる。
 *
 * - px は外枠へ書き、surface は CSS の `height: 100%` のままにする。scroll container 自身へ px を書くと、
 *   高さが変わる layout で Chromium の scroll anchoring が止まり、caret と帯が画面外へ外れる。位置の保持は
 *   ブラウザに任せ、JS の scroll 補正は持たない（docs/editor-surface-height-anchor1-2026-10.md）。
 * - 継承される custom property で渡さない。下の全要素の style が計算し直される（明暗で 1 回 46,665 要素・
 *   約 60 ms。診断: docs/editor-surface-height-style-diag1-2026-10.md）。
 * - 同じ値かどうかは、自分が書いた値と要素の同一性で決める。`style.height` の読み返しは有効数字 6 桁に
 *   丸められるが、保持値と RO の content box は丸めない。値がない間（初回・非表示）は CSS の 100% が効く。
 * - 書字方向で限定しない。横書きでも `100%` と同じ値なので幾何は変わらず、`data-writing-mode` と
 *   `--editor-writing-mode` の更新時点のずれに依存しない。
 * - 監視は panel の寿命の間だけ。timer / polling / rAF で高さを推測しない。RO の通知は layout の後・paint の
 *   前に届き、高さは同じ frame の中で反映される。rAF で幾何を読む表示（擬似キャレット・現在行の帯・入力面）
 *   は、値の実際の変化だけ送る既存 CARETSYNC1 の通知で次の frame に読み直す（resize の途中は 1 frame 遅れ得る）。
 */

export type EditorPanelResizeEntry = {
  readonly contentBoxSize?: ReadonlyArray<{ readonly blockSize: number }> | { readonly blockSize: number }
  readonly contentRect: { readonly height: number }
}

/**
 * RO entry から `.editor-surface-frame` へ書く値を決める（pure）。
 * content box の block size（横書きの panel なので高さ）を優先し、古い形（配列でない
 * `contentBoxSize`）と `contentRect.height` へ順に fallback する。0 以下・非有限は `null`
 * （inline の `height` を外して `100%` に戻す）。
 */
export function resolveEditorSurfaceHeightValue(entry: EditorPanelResizeEntry): string | null {
  const boxSize = entry.contentBoxSize
  const blockSize = Array.isArray(boxSize)
    ? boxSize[0]?.blockSize
    : (boxSize as { blockSize: number } | undefined)?.blockSize
  const height = typeof blockSize === 'number' && Number.isFinite(blockSize) ? blockSize : entry.contentRect.height
  if (!Number.isFinite(height) || height <= 0) return null
  return `${height}px`
}

export type EditorSurfaceHeightSyncHandle = {
  /** 現在 `.editor-surface-frame` に書かれている値（診断・試験用の読み取り）。 */
  readonly current: () => string | null
  readonly dispose: () => void
}

/**
 * `.editor-panel`のcontent boxを外枠へ写す。Reactによる要素の再生成も追従する。
 */
export function createEditorSurfaceHeightSync(
  panel: HTMLElement,
  onHeightChanged?: () => void,
): EditorSurfaceHeightSyncHandle | null {
  const view = panel.ownerDocument.defaultView
  if (!view || typeof view.ResizeObserver !== 'function') return null
  const resolveFrame = (): HTMLElement | null => panel.querySelector<HTMLElement>('.editor-surface-frame')
  let lastValue: string | null = null
  let lastFrame: HTMLElement | null = null
  let hasPreviousMeasurement = false
  const apply = (value: string | null) => {
    const frame = resolveFrame()
    if (!frame) return
    const changed = hasPreviousMeasurement && value !== lastValue
    if (value === null) frame.style.removeProperty('height')
    else if (frame !== lastFrame || value !== lastValue) frame.style.height = value
    lastValue = value
    lastFrame = frame
    hasPreviousMeasurement = true
    if (changed) onHeightChanged?.()
  }
  const observer = new view.ResizeObserver((entries) => {
    let latest: EditorPanelResizeEntry | null = null
    for (const entry of entries) if (entry.target === panel) latest = entry
    if (!latest) return
    apply(resolveEditorSurfaceHeightValue(latest))
  })
  observer.observe(panel, { box: 'content-box' })
  return {
    current: () => lastValue,
    dispose() {
      observer.disconnect()
      resolveFrame()?.style.removeProperty('height')
      lastValue = null
      lastFrame = null
      hasPreviousMeasurement = false
    },
  }
}
