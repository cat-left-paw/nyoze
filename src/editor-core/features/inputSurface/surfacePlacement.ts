import type { OwnerCaretGeometry } from './editOwner'

/** Align block centers; preserve the inline start, including zero-width empty caret rects. */
export function surfacePlacement(rect: OwnerCaretGeometry, blockSize: number, vertical: boolean): { left: number; top: number } {
  return vertical
    ? { left: (rect.left + rect.right - blockSize) / 2, top: rect.top }
    : { left: rect.left, top: (rect.top + rect.bottom - blockSize) / 2 }
}

export type SurfaceBlockPlacement = { left: number; top: number; inlineSize: number; indent: number; firstLineEnd: number }

/** The textblock content box supplies the inline origin and wrap width. */
export function surfaceBlockPlacement(
  caret: OwnerCaretGeometry,
  block: OwnerCaretGeometry,
  edges: { left: number; right: number; top: number; bottom: number },
  blockSize: number,
  vertical: boolean,
): SurfaceBlockPlacement {
  const first = surfacePlacement(caret, blockSize, vertical)
  const inlineStart = vertical ? block.top + edges.top : block.left + edges.left
  const inlineEnd = vertical ? block.bottom - edges.bottom : block.right - edges.right
  const caretStart = vertical ? caret.top : caret.left
  return {
    left: vertical ? first.left : inlineStart,
    top: vertical ? inlineStart : first.top,
    inlineSize: Math.max(1, inlineEnd - inlineStart),
    indent: Math.max(0, caretStart - inlineStart),
    firstLineEnd: vertical ? first.left + blockSize : first.top + blockSize,
  }
}

/** `inlineStart`は、scroll hostの内容の座標（`contentCoordinates.ts`）。`surfaceFollowStart`へ渡す矩形も同じ座標で渡す。 */
export type SurfaceFrozenPlacement = { vertical: boolean; inlineStart: number; size: number }

/**
 * INLINE-2B: ownerの予約領域の最初の文字へ、入力面の最初の文字を合わせる開始位置。
 * inline方向は字下げ、block方向は1行目の行boxの両端（縦書きは左右、横書きは上下）で返す。
 */
export function surfaceFollowStart(
  first: OwnerCaretGeometry,
  placement: SurfaceFrozenPlacement,
): { indent: number; lineStart: number; lineEnd: number } {
  const center = placement.vertical ? (first.left + first.right) / 2 : (first.top + first.bottom) / 2
  return {
    indent: Math.max(0, (placement.vertical ? first.top : first.left) - placement.inlineStart),
    lineStart: center - placement.size / 2,
    lineEnd: center + placement.size / 2,
  }
}
