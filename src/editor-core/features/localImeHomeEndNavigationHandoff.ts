/**
 * 局所 IME slot P2-C2 — bare Home / End handoff 時の既存入口共有。
 *
 * 通常 PM と同様、Typewriter は arrow follow ではなく `home-end-page` jump
 * suppression。pseudo caret は Home=head / End=end affinity。
 * macOS Arrow scroll clamp と classified Arrow follow は呼ばない。
 */

export function notifyLocalImeHomeEndNavigationHandoff(input: {
  event: KeyboardEvent
  noteTypewriterJumpSuppress?: () => void
  notePseudoCaretIntent?: (event: KeyboardEvent) => void
}): void {
  input.noteTypewriterJumpSuppress?.()
  input.notePseudoCaretIntent?.(input.event)
}
