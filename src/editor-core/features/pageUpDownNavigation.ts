import { Selection } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'

type LogPush = (event: string, detail: string) => void

export type PageUpDownDirection = 'pageUp' | 'pageDown'
export type PageUpDownWritingMode = 'horizontal-tb' | 'vertical-rl' | 'vertical-lr'
export type PageUpDownAxis = 'vertical' | 'horizontal'

type ScrollHost = HTMLElement & {
  scrollTop: number
  scrollLeft: number
  clientHeight: number
  clientWidth: number
  scrollHeight: number
  scrollWidth: number
}

type TargetPoint = {
  left: number
  top: number
}

type PageScrollPlan = {
  axis: PageUpDownAxis
  currentOffset: number
  targetOffset: number
  delta: number
  viewportSpan: number
}

type HandlePageUpDownKeyOptions = {
  getIsComposing: () => boolean
  pushLog: LogPush
}

function isBarePageKey(event: KeyboardEvent): boolean {
  return !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function midpoint(start: number, end: number): number {
  return start + (end - start) / 2
}

function clampToRect(value: number, start: number, end: number): number {
  const min = start + 1
  const max = end - 1
  if (!Number.isFinite(value)) return midpoint(start, end)
  if (max < min) return midpoint(start, end)
  return clamp(value, min, max)
}

function resolveScrollHost(view: EditorView): ScrollHost | null {
  return view.dom.closest('.editor-surface') as ScrollHost | null
}

function resolveCaretAnchorPoint(view: EditorView, pos: number): TargetPoint | null {
  try {
    const coords = view.coordsAtPos(pos)
    return {
      left: midpoint(coords.left, coords.right),
      top: midpoint(coords.top, coords.bottom),
    }
  } catch {
    return null
  }
}

function readScrollOffset(host: ScrollHost, axis: PageUpDownAxis): number {
  return axis === 'vertical' ? host.scrollTop : host.scrollLeft
}

function writeScrollOffset(host: ScrollHost, axis: PageUpDownAxis, offset: number): void {
  if (axis === 'vertical') {
    host.scrollTop = offset
    return
  }
  host.scrollLeft = offset
}

function resolveSelectionForPoint(
  view: EditorView,
  points: readonly TargetPoint[],
  direction: PageUpDownDirection,
): Selection | null {
  const bias = direction === 'pageDown' ? 1 : -1
  const maxPos = view.state.doc.content.size
  for (const point of points) {
    const resolved = view.posAtCoords(point)
    if (!resolved) continue
    const clampedPos = clampDocPosition(maxPos, resolved.pos)
    return Selection.near(view.state.doc.resolve(clampedPos), bias)
  }
  return null
}

export function resolvePageUpDownDirection(key: string): PageUpDownDirection | null {
  if (key === 'PageUp') return 'pageUp'
  if (key === 'PageDown') return 'pageDown'
  return null
}

export function resolvePageUpDownWritingMode(view: EditorView): PageUpDownWritingMode {
  const writingMode =
    view.dom?.ownerDocument?.defaultView?.getComputedStyle?.(view.dom).writingMode ?? ''
  if (writingMode.startsWith('vertical-lr')) return 'vertical-lr'
  if (writingMode.startsWith('vertical')) return 'vertical-rl'
  return 'horizontal-tb'
}

export function resolvePageScrollPlan(
  host: Pick<
    ScrollHost,
    'scrollTop' | 'scrollLeft' | 'clientHeight' | 'clientWidth' | 'scrollHeight' | 'scrollWidth'
  >,
  direction: PageUpDownDirection,
  writingMode: PageUpDownWritingMode,
): PageScrollPlan {
  if (writingMode === 'horizontal-tb') {
    const max = Math.max(0, host.scrollHeight - host.clientHeight)
    const current = host.scrollTop
    const delta = direction === 'pageDown' ? host.clientHeight : -host.clientHeight
    const target = clamp(current + delta, 0, max)
    return {
      axis: 'vertical',
      currentOffset: current,
      targetOffset: target,
      delta: target - current,
      viewportSpan: host.clientHeight,
    }
  }

  const max = Math.max(0, host.scrollWidth - host.clientWidth)
  const current = host.scrollLeft
  const delta =
    direction === 'pageDown'
      ? writingMode === 'vertical-rl'
        ? -host.clientWidth
        : host.clientWidth
      : writingMode === 'vertical-rl'
        ? host.clientWidth
        : -host.clientWidth

  const minOffset = writingMode === 'vertical-rl' ? -max : 0
  const maxOffset = writingMode === 'vertical-rl' ? 0 : max
  const target = clamp(current + delta, minOffset, maxOffset)

  return {
    axis: 'horizontal',
    currentOffset: current,
    targetOffset: target,
    delta: target - current,
    viewportSpan: host.clientWidth,
  }
}

export function resolvePageTargetPoints(
  surfaceRect: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>,
  caretPoint: TargetPoint,
  axis: PageUpDownAxis,
): TargetPoint[] {
  const primary = {
    left: clampToRect(caretPoint.left, surfaceRect.left, surfaceRect.right),
    top: clampToRect(caretPoint.top, surfaceRect.top, surfaceRect.bottom),
  }
  const center = {
    left: midpoint(surfaceRect.left, surfaceRect.right),
    top: midpoint(surfaceRect.top, surfaceRect.bottom),
  }

  if (axis === 'vertical') {
    return [primary, { left: center.left, top: primary.top }]
  }
  return [primary, { left: primary.left, top: center.top }]
}

export function clampDocPosition(maxPos: number, pos: number): number {
  return clamp(pos, 0, maxPos)
}

export function handlePageUpDownKey(
  view: EditorView,
  event: KeyboardEvent,
  { getIsComposing, pushLog }: HandlePageUpDownKeyOptions,
): boolean {
  const direction = resolvePageUpDownDirection(event.key)
  if (!direction) return false
  if (!isBarePageKey(event)) return false
  if (getIsComposing() || event.isComposing) return false
  if (!view.state.selection.empty) return false

  const scrollHost = resolveScrollHost(view)
  if (!scrollHost) return false

  const writingMode = resolvePageUpDownWritingMode(view)
  const plan = resolvePageScrollPlan(scrollHost, direction, writingMode)
  if (plan.viewportSpan <= 0) return false
  if (plan.delta === 0) {
    event.preventDefault()
    pushLog('pageNav', `${direction} boundary offset=${plan.currentOffset}`)
    return true
  }

  const caretPoint = resolveCaretAnchorPoint(view, view.state.selection.from)
  if (!caretPoint) return false

  const surfaceRect = scrollHost.getBoundingClientRect()
  const targetPoints = resolvePageTargetPoints(surfaceRect, caretPoint, plan.axis)
  const originalOffset = readScrollOffset(scrollHost, plan.axis)

  try {
    writeScrollOffset(scrollHost, plan.axis, plan.targetOffset)
    const nextSelection = resolveSelectionForPoint(view, targetPoints, direction)
    if (!nextSelection) {
      writeScrollOffset(scrollHost, plan.axis, originalOffset)
      return false
    }

    event.preventDefault()
    const from = view.state.selection.from
    view.dispatch(view.state.tr.setSelection(nextSelection))
    writeScrollOffset(scrollHost, plan.axis, plan.targetOffset)
    pushLog(
      'pageNav',
      `${direction} ${plan.axis} offset=${originalOffset}->${plan.targetOffset} pos=${from}->${nextSelection.from}`,
    )
    return true
  } catch {
    writeScrollOffset(scrollHost, plan.axis, originalOffset)
    return false
  }
}
