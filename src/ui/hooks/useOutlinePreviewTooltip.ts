import { useCallback, useEffect, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, RefObject } from 'react'

/**
 * Outline 拡張: Book全体Outline の冒頭 / 見出し preview tooltip の表示状態を扱う hook。
 *
 * 単文書 Outline（Workspace.tsx）の preview と同じ操作感・見た目に合わせる:
 * - `context`: 行の右クリックでトグル表示。tooltip 自身のクリック / 右クリックで閉じる。
 * - `hover`: preview ボタンの hover で表示し、leave で少し遅らせて閉じる。
 *
 * 単文書 Outline は live PM doc から preview text を取得するが、Book全体Outline は
 * model に precompute 済みの excerpt 文字列を渡す（renderer 側で章ファイルを読まない）。
 * よって本 hook は preview text を引数で受け取り、行を識別する `key`（章 relativePath や
 * 見出し key）で hover-close / context-toggle を判定する。read-only で本文を書き換えない。
 */

export type OutlinePreviewMode = 'context' | 'hover'

type OutlinePreviewTooltipState = {
  /** 対象行の識別子（章 / 見出しごとに一意）。 */
  key: string
  text: string
  x: number
  y: number
  mode: OutlinePreviewMode
}

const HOVER_OFFSET_PX = 10
const PREVIEW_MAX_WIDTH_PX = 300
const HOVER_CLOSE_DELAY_MS = 120

export type UseOutlinePreviewTooltipResult = {
  tooltip: OutlinePreviewTooltipState | null
  tooltipRef: RefObject<HTMLDivElement>
  openContext: (key: string, text: string, event: ReactMouseEvent<HTMLElement>) => void
  openHover: (key: string, text: string, event: ReactMouseEvent<HTMLElement>) => void
  scheduleCloseHover: (key: string) => void
  close: () => void
  isContextOpenFor: (key: string) => boolean
  handleTooltipClick: (event: ReactMouseEvent<HTMLDivElement>) => void
  handleTooltipContextMenu: (event: ReactMouseEvent<HTMLDivElement>) => void
}

export function useOutlinePreviewTooltip(): UseOutlinePreviewTooltipResult {
  const [tooltip, setTooltip] = useState<OutlinePreviewTooltipState | null>(null)
  const tooltipRef = useRef<HTMLDivElement | null>(null)
  const hoverCloseTimerRef = useRef<number | null>(null)

  const clearHoverTimer = useCallback(() => {
    if (hoverCloseTimerRef.current !== null) {
      window.clearTimeout(hoverCloseTimerRef.current)
      hoverCloseTimerRef.current = null
    }
  }, [])

  const close = useCallback(() => {
    clearHoverTimer()
    setTooltip(null)
  }, [clearHoverTimer])

  const openAt = useCallback(
    (mode: OutlinePreviewMode, key: string, text: string, x: number, y: number) => {
      const normalized = text.trim()
      if (!normalized) {
        setTooltip(null)
        return
      }
      setTooltip({ key, text: normalized, x, y, mode })
    },
    [],
  )

  const openContext = useCallback(
    (key: string, text: string, event: ReactMouseEvent<HTMLElement>) => {
      clearHoverTimer()
      openAt('context', key, text, event.clientX + 8, event.clientY + 8)
    },
    [clearHoverTimer, openAt],
  )

  const openHover = useCallback(
    (key: string, text: string, event: ReactMouseEvent<HTMLElement>) => {
      clearHoverTimer()
      const preferredX = event.clientX + HOVER_OFFSET_PX
      const clampedX = Math.max(
        8,
        Math.min(preferredX, window.innerWidth - PREVIEW_MAX_WIDTH_PX - 8),
      )
      openAt('hover', key, text, clampedX, event.clientY + HOVER_OFFSET_PX)
    },
    [clearHoverTimer, openAt],
  )

  const scheduleCloseHover = useCallback((key: string) => {
    if (hoverCloseTimerRef.current !== null) {
      window.clearTimeout(hoverCloseTimerRef.current)
      hoverCloseTimerRef.current = null
    }
    hoverCloseTimerRef.current = window.setTimeout(() => {
      setTooltip((current) => {
        if (!current) return current
        if (current.mode !== 'hover') return current
        if (current.key !== key) return current
        return null
      })
      hoverCloseTimerRef.current = null
    }, HOVER_CLOSE_DELAY_MS)
  }, [])

  const isContextOpenFor = useCallback(
    (key: string): boolean => tooltip?.mode === 'context' && tooltip.key === key,
    [tooltip],
  )

  const handleTooltipClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      event.stopPropagation()
      close()
    },
    [close],
  )

  const handleTooltipContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      event.preventDefault()
      event.stopPropagation()
      close()
    },
    [close],
  )

  // tooltip を viewport 内へ収める（単文書 Outline と同じ clamp）。
  useEffect(() => {
    if (!tooltip) return
    const node = tooltipRef.current
    if (!node) return
    const rect = node.getBoundingClientRect()
    let nextX = tooltip.x
    let nextY = tooltip.y

    if (nextX + rect.width > window.innerWidth - 8) {
      nextX = Math.max(8, window.innerWidth - rect.width - 8)
    }
    if (nextX < 8) nextX = 8
    if (nextY + rect.height > window.innerHeight - 8) {
      if (tooltip.mode === 'hover') {
        const pointerY = tooltip.y - HOVER_OFFSET_PX
        nextY = Math.max(8, pointerY - rect.height - 2)
      } else {
        nextY = Math.max(8, window.innerHeight - rect.height - 8)
      }
    }
    if (nextY < 8) nextY = 8

    if (nextX !== tooltip.x || nextY !== tooltip.y) {
      setTooltip((current) => (current ? { ...current, x: nextX, y: nextY } : current))
    }
  }, [tooltip])

  // 外側クリック / Escape / スクロールで閉じる（単文書 Outline と同方針）。
  useEffect(() => {
    if (!tooltip) return
    const onPointerDown = () => close()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    const onWindowScroll = () => close()
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('scroll', onWindowScroll, true)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('scroll', onWindowScroll, true)
    }
  }, [close, tooltip])

  useEffect(() => clearHoverTimer, [clearHoverTimer])

  return {
    tooltip,
    tooltipRef,
    openContext,
    openHover,
    scheduleCloseHover,
    close,
    isContextOpenFor,
    handleTooltipClick,
    handleTooltipContextMenu,
  }
}
