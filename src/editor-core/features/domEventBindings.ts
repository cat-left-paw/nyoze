type EditorDomEventHandlers = {
  onCompositionStart: (event: CompositionEvent) => void
  onCompositionUpdate: (event: CompositionEvent) => void
  onCompositionEnd: (event: CompositionEvent) => void
  onBeforeInput: (event: InputEvent) => void
  onInput: (event: Event) => void
  onKeyDown: (event: KeyboardEvent) => void
  onClick: (event: MouseEvent) => void
  onMouseOver: (event: MouseEvent) => void
  onMouseOut: (event: MouseEvent) => void
  onWheel: (event: WheelEvent) => void
  onPointerDown?: (event: PointerEvent) => void
  onPointerUp?: (event: PointerEvent) => void
}

const beforeInputListenerOptions: AddEventListenerOptions = { capture: true }

export function bindEditorDomEvents(
  dom: HTMLElement,
  handlers: EditorDomEventHandlers,
): () => void {
  dom.addEventListener('compositionstart', handlers.onCompositionStart)
  dom.addEventListener('compositionupdate', handlers.onCompositionUpdate)
  dom.addEventListener('compositionend', handlers.onCompositionEnd)
  dom.addEventListener('beforeinput', handlers.onBeforeInput, beforeInputListenerOptions)
  dom.addEventListener('input', handlers.onInput)
  dom.addEventListener('keydown', handlers.onKeyDown)
  dom.addEventListener('click', handlers.onClick)
  dom.addEventListener('mouseover', handlers.onMouseOver)
  dom.addEventListener('mouseout', handlers.onMouseOut)
  dom.addEventListener('wheel', handlers.onWheel, { passive: false })
  if (handlers.onPointerDown) dom.addEventListener('pointerdown', handlers.onPointerDown)
  if (handlers.onPointerUp) dom.addEventListener('pointerup', handlers.onPointerUp)

  return () => {
    dom.removeEventListener('compositionstart', handlers.onCompositionStart)
    dom.removeEventListener('compositionupdate', handlers.onCompositionUpdate)
    dom.removeEventListener('compositionend', handlers.onCompositionEnd)
    dom.removeEventListener('beforeinput', handlers.onBeforeInput, beforeInputListenerOptions)
    dom.removeEventListener('input', handlers.onInput)
    dom.removeEventListener('keydown', handlers.onKeyDown)
    dom.removeEventListener('click', handlers.onClick)
    dom.removeEventListener('mouseover', handlers.onMouseOver)
    dom.removeEventListener('mouseout', handlers.onMouseOut)
    dom.removeEventListener('wheel', handlers.onWheel)
    if (handlers.onPointerDown) dom.removeEventListener('pointerdown', handlers.onPointerDown)
    if (handlers.onPointerUp) dom.removeEventListener('pointerup', handlers.onPointerUp)
  }
}
