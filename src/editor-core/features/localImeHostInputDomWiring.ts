/**
 * HOSTINPUT-REARM1: host DOM input eventをtyped transaction notifierへ渡す薄い配線。
 * eventはassociation hintに限定し、完了authorityはnotifier後段の実PM batch proofが持つ。
 */

type HostInputNotifier = {
  noteBeforeInput: (input: { isTrusted: boolean; isComposing: boolean }) => void
  noteInput: (input: { isTrusted: boolean; isComposing: boolean }) => void
  noteCompositionEndEvent: () => void
  noteCompositionEnd: () => void
}

export function createLocalImeHostInputDomWiring(options: {
  notifier: HostInputNotifier
  getHostCompositionActive: () => boolean
  handleBeforeInput: (event: InputEvent) => void
  handleInput: (event: Event) => void
  handleCompositionEnd: (event: CompositionEvent) => void
}) {
  return {
    onBeforeInput(event: InputEvent) {
      options.notifier.noteBeforeInput({
        isTrusted: event.isTrusted,
        isComposing: event.isComposing || options.getHostCompositionActive(),
      })
      options.handleBeforeInput(event)
    },
    onInput(event: Event) {
      const inputEvent = event as InputEvent
      options.notifier.noteInput({
        isTrusted: inputEvent.isTrusted,
        isComposing: inputEvent.isComposing || options.getHostCompositionActive(),
      })
      options.handleInput(event)
    },
    onCompositionEnd(event: CompositionEvent) {
      options.notifier.noteCompositionEndEvent()
      options.handleCompositionEnd(event)
      // 既存composition state clearの後、notifierが最終PM batch proofを評価する。
      queueMicrotask(() => options.notifier.noteCompositionEnd())
    },
  }
}
