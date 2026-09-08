import type { PseudoCaretControllerHandle } from './pseudoCaretController'

/** Local Window lifecycle → 既存表示controller配線だけを集約する薄いhelper。 */
export function createLocalImePseudoCaretSlotAttachCallbacks(input: {
  pseudoCaretController: PseudoCaretControllerHandle | null
  visualFocusController: { scheduleUpdate: () => void } | null
}) {
  return {
    schedulePseudoCaretLocalWindowUpdate: () => input.pseudoCaretController?.scheduleUpdate(),
    notePseudoCaretLocalWindowKeyboardIntent: (
      event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey'>,
    ) => {
      input.visualFocusController?.scheduleUpdate()
      input.pseudoCaretController?.noteKeyboardNavigationIntent(event)
      input.pseudoCaretController?.scheduleUpdate()
    },
  }
}
