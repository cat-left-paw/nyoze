/** Clipboard policy is independent of DOM ownership and the PM runtime. */
export function mayCopyCutFromSurface(input: {
  focused: boolean; eligible: boolean; composing: boolean; retained: boolean; selectionEmpty: boolean
}): boolean {
  return input.focused && input.eligible && !input.composing && !input.retained && !input.selectionEmpty
}

export function isPlainSurfacePaste(shift: boolean, lastKeyCode: number): boolean {
  return shift && lastKeyCode !== 45 // PM excludes Insert-origin paste.
}

export function resolveSurfacePaste(data: Pick<DataTransfer, 'getData'>, plain: boolean, inCode: boolean):
  { kind: 'text' | 'html' | 'none'; value: string } {
  const text = data.getData('text/plain') || data.getData('Text') || data.getData('text/uri-list').replace(/\r?\n/g, ' ')
  const html = data.getData('text/html')
  if (text && (plain || inCode || !html)) return { kind: 'text', value: text }
  if (html) return { kind: 'html', value: html }
  return { kind: 'none', value: '' }
}
