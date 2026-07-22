import { useCallback, useRef, useState, type FocusEvent, type ReactNode } from 'react'
import { FloatingTooltipChip } from '../components/FloatingTooltipChip'

/**
 * 右ペインの icon-only ボタン用 floating tooltip フック。
 *
 * label を持つ anchor（button または disabled 時の wrapper span）へ `anchorProps` を
 * 展開し、hover / focus-visible で {@link FloatingTooltipChip} を `position: fixed` の portal
 * として出す。chip は scroll container に clip されない。native `title` は使わず custom chip と
 * 二重表示しない。
 *
 * - hover / focus-visible で即表示。
 * - pointer leave / blur / Escape / scroll / resize で非表示。
 * - aria-label は anchor 側に残す前提（chip は `aria-hidden`、二重読み上げ回避）。
 */
export function useFloatingTooltip(label: string): {
  anchorProps: {
    ref: (el: HTMLElement | null) => void
    onPointerEnter: () => void
    onPointerLeave: () => void
    onFocus: (event: FocusEvent<HTMLElement>) => void
    onBlur: () => void
  }
  tooltip: ReactNode
} {
  const anchorRef = useRef<HTMLElement | null>(null)
  const [visible, setVisible] = useState(false)

  const setAnchor = useCallback((el: HTMLElement | null) => {
    anchorRef.current = el
  }, [])

  const show = useCallback(() => {
    if (label) setVisible(true)
  }, [label])
  const hide = useCallback(() => setVisible(false), [])

  const onFocus = useCallback(
    (event: FocusEvent<HTMLElement>) => {
      // keyboard focus（focus-visible）でだけ出す。click 由来の focus では出さない。
      if (event.currentTarget.matches(':focus-visible')) show()
    },
    [show],
  )

  const anchorProps = {
    ref: setAnchor,
    onPointerEnter: show,
    onPointerLeave: hide,
    onFocus,
    onBlur: hide,
  }

  const tooltip =
    visible && label ? (
      <FloatingTooltipChip label={label} anchorRef={anchorRef} onDismiss={hide} />
    ) : null

  return { anchorProps, tooltip }
}
