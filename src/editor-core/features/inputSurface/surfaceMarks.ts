/** Mark names are the visual subset of the Host schema. No PM DOM mutation. */
export const SURFACE_MARK_NAMES = ['bold', 'italic', 'strike', 'underline', 'highlight', 'code', 'link'] as const
type SurfaceMark = (typeof SURFACE_MARK_NAMES)[number]

export function classifySurfaceMarks(names: readonly string[]): SurfaceMark[] | null {
  if (names.some(name => !SURFACE_MARK_NAMES.includes(name as SurfaceMark))) return null
  return [...new Set(names as SurfaceMark[])].sort()
}

export function sameSurfaceMarks(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((name, index) => name === b[index])
}

export function domSurfaceMarks(element: Element, textblock: Element): SurfaceMark[] {
  const names: SurfaceMark[] = []
  for (let node: Element | null = element; node && node !== textblock; node = node.parentElement) {
    if (node.matches('strong,b')) names.push('bold')
    if (node.matches('em,i')) names.push('italic')
    if (node.matches('s,del,strike')) names.push('strike')
    if (node.matches('u,.tategaki-md-underline')) names.push('underline')
    if (node.matches('mark,.tategaki-md-highlight')) names.push('highlight')
    if (node.matches('code.tategaki-md-code')) names.push('code')
    if (node.matches('a[href]')) names.push('link')
  }
  return [...new Set(names)].sort()
}

/** CSS mirrors the existing mark selectors in styles.css; variables stay live. */
export function surfaceMarkStyle(names: readonly SurfaceMark[]): Record<string, string> {
  const style: Record<string, string> = {}
  if (names.includes('bold')) style['font-weight'] = '700'
  if (names.includes('italic')) style['font-style'] = 'italic'
  const lines = [names.includes('strike') && 'line-through', (names.includes('underline') || names.includes('link')) && 'underline'].filter(Boolean)
  style['text-decoration-line'] = lines.join(' ') || 'none'
  if (names.includes('link')) style.color = 'var(--accent-link)'
  if (names.includes('highlight')) {
    style['background-color'] = 'var(--highlight-bg)'
    style.padding = '0 0.05em'
    style['border-radius'] = '2px'
  }
  if (names.includes('code')) {
    style['font-family'] = '"SF Mono", Menlo, Consolas, monospace'
    style['background-color'] = 'var(--code-inline-bg)'
    style.border = '1px solid var(--code-inline-border)'
    style['border-radius'] = '3px'
    style.padding = '0 0.15em'
    style['text-orientation'] = 'sideways'
  }
  return style
}
