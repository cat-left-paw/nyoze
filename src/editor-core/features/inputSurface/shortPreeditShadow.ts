/** Short sideways ASCII runs need a paint workaround for Chromium's opaque Highlights.
 * Measure the string with the already copied typography, never the receiver's DOM layout.
 */
export function createShortPreeditShadow(element: HTMLElement) {
  let context: CanvasRenderingContext2D | null | undefined
  let previousKey = '', previousValue = false
  return () => {
    const s = element.style, text = element.textContent ?? ''
    const key = JSON.stringify([text, s.writingMode, s.textOrientation, s.fontFamily, s.fontSize,
      s.fontStyle, s.fontWeight, s.fontStretch, s.letterSpacing, s.wordSpacing, s.textTransform])
    if (key === previousKey) return previousValue
    previousKey = key
    previousValue = false
    // Upright kana/kanji and horizontal writing must retain their original paint.
    if (!s.writingMode?.startsWith('vertical') || s.textOrientation === 'upright' ||
      !/[!-~]/.test(text) || !/^[\x20-\x7e\r\n]+$/.test(text)) return false
    const size = parseFloat(s.fontSize)
    if (!(size > 0)) return false
    if (context === undefined) context = element.ownerDocument.createElement('canvas').getContext('2d')
    if (!context) return false
    context.font = `${s.fontStyle || 'normal'} ${s.fontWeight || 'normal'} ${size}px ${s.fontFamily}`
    context.fontStretch = (s.fontStretch || 'normal') as CanvasFontStretch
    context.letterSpacing = s.letterSpacing === 'normal' ? '0px' : s.letterSpacing || '0px'
    context.wordSpacing = s.wordSpacing === 'normal' ? '0px' : s.wordSpacing || '0px'
    const displayed = s.textTransform === 'uppercase' ? text.toUpperCase() :
      s.textTransform === 'lowercase' ? text.toLowerCase() : text
    // Explicit lines also occur in retained (rejected newline) payloads. A long line
    // makes this a normal paint case; do not darken it or a soft-wrapped long run.
    previousValue = displayed.split(/\r\n?|\n/).every(line => context!.measureText(line).width < size)
    return previousValue
  }
}
