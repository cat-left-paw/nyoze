/**
 * 局所 IME slot P2-F1 — pointer selection handoff 時の既存入口共有。
 *
 * PM の通常 pointerdown を経由しないため、Typewriter jump suppress と
 * pseudo caret の pointer affinity を同じ意図で呼び出す。
 * Arrow follow / macOS Arrow clamp は呼ばない。
 */

export function notifyLocalImePointerSelectionHandoff(input: {
  clientX: number
  clientY: number
  noteTypewriterJumpSuppress?: () => void
  notePseudoCaretPointerIntent?: (point: { x: number; y: number }) => void
}): void {
  input.noteTypewriterJumpSuppress?.()
  input.notePseudoCaretPointerIntent?.({ x: input.clientX, y: input.clientY })
}
