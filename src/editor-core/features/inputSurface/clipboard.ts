import type { EditOwner } from './editOwner'
import type { InputSurface, SurfaceRecord } from './inputSurface'
import { isPlainSurfacePaste, mayCopyCutFromSurface } from './clipboardPolicy'

export function createInputSurfaceClipboard(options: {
  surface: InputSurface
  currentOwner(): EditOwner
  isEligible(): boolean
  isComposing(): boolean
  selectionEmpty(): boolean
  refresh(): void
  record: SurfaceRecord
}) {
  const { surface, record } = options, element = surface.element
  const doc = element.ownerDocument
  let shift = false, lastKeyCode = 0
  const focused = () => doc.activeElement === element
  const ready = () => mayCopyCutFromSurface({
    focused: focused(), eligible: options.isEligible(), composing: options.isComposing(),
    retained: !!surface.text(), selectionEmpty: options.selectionEmpty(),
  })
  const beforeCopyCut = (event: Event) => {
    if (ready()) {
      event.preventDefault()
      record('surface-before-clipboard', { type: event.type, trusted: event.isTrusted })
    }
  }
  const copyCut = (event: ClipboardEvent) => {
    if (!ready()) return
    const handled = options.currentOwner().handleClipboardCopyCut(event)
    options.refresh()
    record('surface-clipboard', {
      type: event.type, trusted: event.isTrusted, handled,
      flavors: event.clipboardData ? Array.from(event.clipboardData.types) : [],
      lengths: event.clipboardData ? Object.fromEntries(Array.from(event.clipboardData.types, type => [type, event.clipboardData!.getData(type).length])) : {},
    })
  }
  const paste = (event: ClipboardEvent) => {
    if (!focused()) return
    const retained = !!surface.text(), composing = options.isComposing()
    if (!options.isEligible() || retained || composing) {
      event.preventDefault()
      record('surface-paste-blocked', { retained, composing, eligible: options.isEligible(), trusted: event.isTrusted })
      return
    }
    const plain = isPlainSurfacePaste(shift, lastKeyCode)
    const data = event.clipboardData
    const flavors = data ? Array.from(data.types) : []
    const handled = options.currentOwner().handleClipboardPaste(event, plain)
    event.preventDefault()
    options.refresh()
    record('surface-paste', { trusted: event.isTrusted, plain, flavors, handled })
  }
  const keydown = (event: KeyboardEvent) => { shift = event.keyCode === 16 || event.shiftKey; lastKeyCode = event.keyCode }
  const keyup = (event: KeyboardEvent) => { if (event.keyCode === 16 || event.key === 'Shift') shift = false }
  const blur = () => { shift = false; lastKeyCode = 0 }
  element.addEventListener('beforecopy', beforeCopyCut)
  element.addEventListener('beforecut', beforeCopyCut)
  element.addEventListener('copy', copyCut)
  element.addEventListener('cut', copyCut)
  element.addEventListener('paste', paste)
  element.addEventListener('keydown', keydown)
  element.addEventListener('keyup', keyup)
  element.addEventListener('blur', blur)
  return { destroy() {
    element.removeEventListener('beforecopy', beforeCopyCut)
    element.removeEventListener('beforecut', beforeCopyCut)
    element.removeEventListener('copy', copyCut)
    element.removeEventListener('cut', copyCut)
    element.removeEventListener('paste', paste)
    element.removeEventListener('keydown', keydown)
    element.removeEventListener('keyup', keyup)
    element.removeEventListener('blur', blur)
  } }
}
