import { createPortal } from 'react-dom'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

const TOOLTIP_VIEWPORT_MARGIN = 8
const TOOLTIP_ANCHOR_GAP = 8

/**
 * 右ペインの icon-only ボタン用 floating tooltip chip。
 *
 * CSS の `::after` chip は `.project-pane-index`（`overflow-y: auto`）の中で
 * ペイン端・スクロール領域下端に clip されてしまうため、anchor の
 * `getBoundingClientRect()` を基準に `position: fixed` の portal として描画し、
 * viewport 内へ clamp / flip する。位置決めだけ inline style で当て、見た目は
 * `.floating-tooltip`（toolbar chip と同じ見た目）に寄せる。
 *
 * mount / unmount と表示状態は {@link useFloatingTooltip} が制御する。
 */
export function FloatingTooltipChip({
  label,
  anchorRef,
  onDismiss,
}: {
  label: string
  anchorRef: { current: HTMLElement | null }
  onDismiss: () => void
}) {
  const chipRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  const position = useCallback(() => {
    const anchor = anchorRef.current
    const chip = chipRef.current
    if (!anchor || !chip) return

    const rect = anchor.getBoundingClientRect()
    const cw = chip.offsetWidth
    const ch = chip.offsetHeight

    // 既定は anchor の下。下端に入りきらなければ上へ flip。
    let top = rect.bottom + TOOLTIP_ANCHOR_GAP
    if (top + ch + TOOLTIP_VIEWPORT_MARGIN > window.innerHeight) {
      const above = rect.top - TOOLTIP_ANCHOR_GAP - ch
      top =
        above >= TOOLTIP_VIEWPORT_MARGIN
          ? above
          : Math.max(TOOLTIP_VIEWPORT_MARGIN, window.innerHeight - ch - TOOLTIP_VIEWPORT_MARGIN)
    }

    // anchor 中央寄せ → viewport 内へ clamp（右端ボタンでも左端で切れない）。
    let left = rect.left + rect.width / 2 - cw / 2
    left = Math.max(
      TOOLTIP_VIEWPORT_MARGIN,
      Math.min(left, window.innerWidth - cw - TOOLTIP_VIEWPORT_MARGIN),
    )

    setPos({ left, top })
  }, [anchorRef])

  useLayoutEffect(() => {
    position()
    // 折り返し後の実寸で再配置（max-width 折り返し時の高さ確定後）。
    const id = window.requestAnimationFrame(() => position())
    return () => window.cancelAnimationFrame(id)
  }, [position, label])

  useEffect(() => {
    const onScrollOrResize = () => onDismiss()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss()
    }
    // capture: true で内側 scroll container（.project-pane-index 等）の scroll も拾う。
    window.addEventListener('scroll', onScrollOrResize, true)
    window.addEventListener('resize', onScrollOrResize)
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true)
      window.removeEventListener('resize', onScrollOrResize)
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [onDismiss])

  return createPortal(
    <div
      ref={chipRef}
      className="floating-tooltip"
      aria-hidden
      style={{
        position: 'fixed',
        left: pos ? `${pos.left}px` : '-9999px',
        top: pos ? `${pos.top}px` : '-9999px',
        visibility: pos ? 'visible' : 'hidden',
      }}
    >
      {label}
    </div>,
    document.body,
  )
}
