export function resolveClickTargetElement(target: EventTarget | null): Element | null {
  if (target instanceof Element) return target
  if (target instanceof Text) return target.parentElement
  return null
}

export function resolveFoldToggleHeadingPos(
  targetElement: Element,
  foldToggleClass: string,
): number | null {
  const foldToggle = targetElement.closest(`.${foldToggleClass}`)
  if (!(foldToggle instanceof HTMLElement)) return null
  if (!foldToggle.dataset.headingPos) return null
  const headingPos = Number(foldToggle.dataset.headingPos)
  if (!Number.isFinite(headingPos)) return null
  return headingPos
}

export function resolveChecklistClickPos(
  targetElement: Element,
  posAtDOM: (node: Node, offset: number) => number,
): number | null {
  const listItemEl = targetElement.closest('li[data-checked]')
  if (!(listItemEl instanceof HTMLLIElement)) return null
  if (targetElement !== listItemEl) return null

  try {
    return posAtDOM(listItemEl, 0)
  } catch {
    return null
  }
}
