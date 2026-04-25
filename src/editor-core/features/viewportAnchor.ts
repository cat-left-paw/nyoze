import type { EditorView } from '@tiptap/pm/view'
import type { ViewportAnchor } from '../types'

/**
 * Locate the .editor-surface scroll host that contains the given PM view DOM.
 * Returns null when the view is detached or hidden.
 */
function getSurfaceHost(view: EditorView): HTMLElement | null {
  const surface = view.dom.closest('.editor-surface')
  return surface instanceof HTMLElement ? surface : null
}

/**
 * Compute the PM doc position nearest the viewport center of the scroll host.
 * Falls back to the nearest resolvable position when the exact center is empty.
 */
function resolveCenterPos(view: EditorView, surface: HTMLElement): number | null {
  const rect = surface.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return null
  const centerX = rect.left + rect.width / 2
  const centerY = rect.top + rect.height / 2
  const hit = view.posAtCoords({ left: centerX, top: centerY })
  if (hit) return hit.pos

  // Probe a small grid in case the direct center falls on whitespace / padding.
  const probes: Array<[number, number]> = [
    [centerX, rect.top + rect.height * 0.25],
    [centerX, rect.top + rect.height * 0.75],
    [rect.left + rect.width * 0.25, centerY],
    [rect.left + rect.width * 0.75, centerY],
  ]
  for (const [x, y] of probes) {
    const probe = view.posAtCoords({ left: x, top: y })
    if (probe) return probe.pos
  }
  return null
}

export function captureViewportAnchor(view: EditorView): ViewportAnchor | null {
  const surface = getSurfaceHost(view)
  if (!surface) return null
  const pos = resolveCenterPos(view, surface)
  if (pos === null) return null
  const docSize = view.state.doc.content.size
  const safePos = Math.max(0, Math.min(pos, docSize))
  const textOffset = view.state.doc.textBetween(0, safePos, '\n', '\n').length
  const textTotal = view.state.doc.textBetween(0, docSize, '\n', '\n').length
  return { pmPos: safePos, textOffset, textTotal }
}

function scrollSurfaceToCoords(
  view: EditorView,
  surface: HTMLElement,
  pmPos: number,
): boolean {
  const docSize = view.state.doc.content.size
  const pos = Math.max(0, Math.min(pmPos, docSize))
  let coords: { top: number; bottom: number; left: number; right: number }
  try {
    coords = view.coordsAtPos(pos)
  } catch {
    return false
  }
  const hostRect = surface.getBoundingClientRect()
  if (hostRect.width <= 0 || hostRect.height <= 0) return false

  const targetCenterViewportX = (coords.left + coords.right) / 2
  const targetCenterViewportY = (coords.top + coords.bottom) / 2

  // Scroll so the anchor sits at the viewport center along the main scroll
  // axis. Writing-mode dictates which axis is authoritative; adjust both.
  const writingMode = getComputedStyle(surface).writingMode
  const isVertical = writingMode.startsWith('vertical') || writingMode.startsWith('sideways')

  if (isVertical) {
    const deltaX = targetCenterViewportX - (hostRect.left + hostRect.width / 2)
    surface.scrollLeft = surface.scrollLeft + deltaX
    // Some layouts still expose a residual vertical axis (content shorter than host);
    // keep it at 0 to avoid stale scrollTop from a previous horizontal session.
    surface.scrollTop = 0
  } else {
    const deltaY = targetCenterViewportY - (hostRect.top + hostRect.height / 2)
    surface.scrollTop = surface.scrollTop + deltaY
    surface.scrollLeft = 0
  }
  return true
}

/**
 * Restore a viewport anchor without moving the selection or focus. Uses the
 * scroll host's current layout, so it stays correct even after writing-mode
 * changed between capture and restore.
 */
export function restoreViewportAnchor(
  view: EditorView,
  anchor: ViewportAnchor,
): void {
  const surface = getSurfaceHost(view)
  if (!surface) return
  scrollSurfaceToCoords(view, surface, anchor.pmPos)
}

function textLengthToPos(view: EditorView, pos: number): number {
  return view.state.doc.textBetween(0, pos, '\n', '\n').length
}

function resolvePmPosNearTextOffset(
  view: EditorView,
  textOffset: number,
): number | null {
  if (!Number.isFinite(textOffset)) return null
  const docSize = view.state.doc.content.size
  if (docSize <= 0) return 0

  const textTotal = textLengthToPos(view, docSize)
  if (textTotal <= 0) return 0

  const target = Math.max(0, Math.min(textOffset, textTotal))
  if (target <= 0) return 0
  if (target >= textTotal) return docSize

  // Keep this deliberately approximate: use the same PM text axis as
  // ViewportAnchor.textOffset and binary-search doc positions by textBetween
  // length, without building a full Markdown offset map.
  let low = 0
  let high = docSize
  while (low < high) {
    const mid = Math.floor((low + high) / 2)
    if (textLengthToPos(view, mid) < target) {
      low = mid + 1
    } else {
      high = mid
    }
  }

  let bestPos = low
  let bestDistance = Math.abs(textLengthToPos(view, low) - target)
  const probeStart = Math.max(0, low - 8)
  const probeEnd = Math.min(docSize, low + 8)
  for (let pos = probeStart; pos <= probeEnd; pos += 1) {
    const distance = Math.abs(textLengthToPos(view, pos) - target)
    if (distance < bestDistance) {
      bestDistance = distance
      bestPos = pos
    }
  }

  return bestPos
}

/**
 * Scroll the editor surface to a PM text offset (`doc.textBetween` axis).
 * This is a closer Source Mode bridge than ratio * PM docSize because it
 * ignores PM structural token positions that do not correspond to plain text.
 */
export function scrollEditorSurfaceToTextOffset(
  view: EditorView,
  textOffset: number,
): boolean {
  const surface = getSurfaceHost(view)
  if (!surface) return false
  const pmPos = resolvePmPosNearTextOffset(view, textOffset)
  if (pmPos === null) return false
  return scrollSurfaceToCoords(view, surface, pmPos)
}

/**
 * Scroll the editor surface so a position roughly at the given document ratio
 * (0..1) is near the viewport center. Used as an approximate bridge between
 * Source Mode (CodeMirror) scroll and the PM editor, when the exact PM pos
 * cannot be mapped from a Markdown offset.
 */
export function scrollEditorSurfaceToRatio(
  view: EditorView,
  ratio: number,
): void {
  const surface = getSurfaceHost(view)
  if (!surface) return
  const clamped = Math.max(0, Math.min(1, ratio))
  const docSize = view.state.doc.content.size
  const pmPos = Math.round(clamped * docSize)
  scrollSurfaceToCoords(view, surface, pmPos)
}
