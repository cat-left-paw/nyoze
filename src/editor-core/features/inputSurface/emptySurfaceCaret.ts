/** Range boundaries are DOM data; Selection.isCollapsed resolves visual selection and may lay out Host. */
export function hasCanonicalEmptySurfaceCaret(element: HTMLElement, selection: Selection | null): boolean {
  if (selection?.rangeCount !== 1) return false
  const range = selection.getRangeAt(0)
  return range.collapsed && range.startContainer === element && range.startOffset === 0
}
