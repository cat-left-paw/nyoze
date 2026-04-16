import { useCallback, useEffect, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import {
  DIVIDER_WIDTH,
  MIN_CENTER_WIDTH,
  MIN_LEFT_WIDTH,
  MIN_RIGHT_WIDTH,
} from '../../settings/defaults'
import { loadPaneState, savePaneState } from '../../settings/storage'

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function usePaneLayout() {
  const workspaceRef = useRef<HTMLElement | null>(null)

  const initialPane = useRef(loadPaneState()).current
  const [leftPaneOpen, setLeftPaneOpen] = useState(initialPane.leftOpen)
  const [rightPaneOpen, setRightPaneOpen] = useState(initialPane.rightOpen)
  const [leftWidth, setLeftWidth] = useState(initialPane.leftWidth)
  const [rightWidth, setRightWidth] = useState(initialPane.rightWidth)

  const dragRef = useRef<{
    side: 'left' | 'right'
    startX: number
    startWidth: number
  } | null>(null)

  const handleDividerMouseDown = useCallback(
    (side: 'left' | 'right', e: ReactMouseEvent) => {
      e.preventDefault()
      const startWidth = side === 'left' ? leftWidth : rightWidth
      const minWidth = side === 'left' ? MIN_LEFT_WIDTH : MIN_RIGHT_WIDTH
      const oppositeWidth =
        side === 'left'
          ? rightPaneOpen
            ? rightWidth
            : 0
          : leftPaneOpen
            ? leftWidth
            : 0
      const visibleDividers = (leftPaneOpen ? 1 : 0) + (rightPaneOpen ? 1 : 0)
      const workspaceWidth =
        workspaceRef.current?.clientWidth ?? window.innerWidth
      const maxWidth = Math.max(
        minWidth,
        workspaceWidth -
          oppositeWidth -
          MIN_CENTER_WIDTH -
          visibleDividers * DIVIDER_WIDTH,
      )

      dragRef.current = { side, startX: e.clientX, startWidth }

      const onMove = (ev: MouseEvent) => {
        if (!dragRef.current) return
        const delta = ev.clientX - dragRef.current.startX
        if (dragRef.current.side === 'left') {
          setLeftWidth(
            clampNumber(dragRef.current.startWidth + delta, minWidth, maxWidth),
          )
        } else {
          setRightWidth(
            clampNumber(dragRef.current.startWidth - delta, minWidth, maxWidth),
          )
        }
      }

      const onUp = () => {
        dragRef.current = null
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
        document.body.classList.remove('is-resizing-pane')
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }

      document.body.classList.add('is-resizing-pane')
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    },
    [leftPaneOpen, rightPaneOpen, leftWidth, rightWidth],
  )

  const clampPaneWidthsToViewport = useCallback(() => {
    const workspaceWidth =
      workspaceRef.current?.clientWidth ?? window.innerWidth
    const visibleDividers = (leftPaneOpen ? 1 : 0) + (rightPaneOpen ? 1 : 0)
    const availableForSides =
      workspaceWidth - MIN_CENTER_WIDTH - visibleDividers * DIVIDER_WIDTH

    let nextLeftWidth = leftWidth
    let nextRightWidth = rightWidth

    if (leftPaneOpen) {
      const leftMax = Math.max(
        MIN_LEFT_WIDTH,
        availableForSides - (rightPaneOpen ? nextRightWidth : 0),
      )
      nextLeftWidth = clampNumber(nextLeftWidth, MIN_LEFT_WIDTH, leftMax)
    }

    if (rightPaneOpen) {
      const rightMax = Math.max(
        MIN_RIGHT_WIDTH,
        availableForSides - (leftPaneOpen ? nextLeftWidth : 0),
      )
      nextRightWidth = clampNumber(nextRightWidth, MIN_RIGHT_WIDTH, rightMax)
    }

    if (nextLeftWidth !== leftWidth) setLeftWidth(nextLeftWidth)
    if (nextRightWidth !== rightWidth) setRightWidth(nextRightWidth)
  }, [leftPaneOpen, rightPaneOpen, leftWidth, rightWidth])

  useEffect(() => {
    clampPaneWidthsToViewport()

    const workspace = workspaceRef.current
    if (workspace && typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => {
        clampPaneWidthsToViewport()
      })
      observer.observe(workspace)
      return () => observer.disconnect()
    }

    const onResize = () => {
      clampPaneWidthsToViewport()
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
    }
  }, [clampPaneWidthsToViewport])

  useEffect(() => {
    savePaneState({
      leftOpen: leftPaneOpen,
      rightOpen: rightPaneOpen,
      leftWidth,
      rightWidth,
    })
  }, [leftPaneOpen, rightPaneOpen, leftWidth, rightWidth])

  return {
    workspaceRef,
    leftPaneOpen,
    rightPaneOpen,
    leftWidth,
    rightWidth,
    setLeftPaneOpen,
    setRightPaneOpen,
    setLeftWidth,
    setRightWidth,
    handleDividerMouseDown,
  }
}
