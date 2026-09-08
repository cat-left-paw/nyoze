/**
 * 局所 IME slot P2-C3 — bare PageUp / PageDown handoff 時の既存入口共有。
 *
 * 通常 PM と同様、Typewriter は `page-up-down` jump suppression だけ。
 * Arrow follow / macOS Arrow scroll clamp / Home·End 用 suppress /
 * pseudo caret 専用 affinity は呼ばない。
 */

export function notifyLocalImePageUpDownNavigationHandoff(input: {
  noteTypewriterJumpSuppress?: () => void
}): void {
  input.noteTypewriterJumpSuppress?.()
}
