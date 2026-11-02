/**
 * PIS-S10-CURRENT-LINE2 (b): 変換中の文字を、本文へ重ねて表示するとき（Hostに予約領域がない表示）の、不透明な下地の色。
 *
 * textblockから親をたどった背景の列から、最初の**不透明な**背景まで進み、途中の半透明の背景（編集ブロックのハイライトなど）を、
 * ブラウザが重ねるのと同じ順（外側から内側）で先に合成する。下地が半透明だと、下の本文の字が透けて、変換中の文字と重なって見える。
 * pureな計算だけ（DOMは読まない）。
 */
export type Rgba = readonly [red: number, green: number, blue: number, alpha: number]

const clamp = (value: number, max: number) => Math.min(max, Math.max(0, value))

/** 計算後の色（`rgb()` / `rgba()` / `color(srgb …)`）を、0〜255の色と0〜1の不透明度へ。読めない形はnull。 */
export function parseComputedColor(value: string): Rgba | null {
  const text = value.trim()
  if (text === 'transparent') return [0, 0, 0, 0]
  const legacy = /^rgba?\(([^)]+)\)$/.exec(text)
  const srgb = legacy ? null : /^color\(srgb\s+([^)]+)\)$/.exec(text)
  const body = legacy?.[1] ?? srgb?.[1]
  if (body === undefined) return null
  const parts = body.split(/[\s,/]+/).filter(Boolean).map(part => (part === 'none' ? 0 : Number(part)))
  if ((parts.length !== 3 && parts.length !== 4) || parts.some(part => !Number.isFinite(part))) return null
  const scale = srgb ? 255 : 1
  return [clamp(parts[0]! * scale, 255), clamp(parts[1]! * scale, 255), clamp(parts[2]! * scale, 255), clamp(parts[3] ?? 1, 1)]
}

/** 完全な透明か（読めない形は、透明ではないものとして扱う）。 */
export function isTransparentColor(value: string): boolean {
  return parseComputedColor(value)?.[3] === 0
}

/** 不透明か（読めない形は、合成できないので不透明として扱う）。 */
export function isOpaqueColor(value: string): boolean {
  const color = parseComputedColor(value)
  return !color || color[3] >= 1
}

/**
 * `backgrounds`は、textblockから外側へ向かう順の、計算後の背景色。最初の不透明な背景の上へ、それより内側の半透明の背景を、
 * 外側から順に重ねた不透明な色を返す。不透明な背景がなければ`fallback`を下地にする。
 */
export function resolveOpaqueBackdrop(backgrounds: readonly string[], fallback: string): string {
  const layers: Rgba[] = []
  let base: string = fallback
  for (const value of backgrounds) {
    const color = parseComputedColor(value)
    if (color && color[3] <= 0) continue
    if (!color || color[3] >= 1) { base = value; break }
    layers.push(color)
  }
  const opaque = parseComputedColor(base)
  // 下地の形が読めないときは、合成できない。不透明なその色を、そのまま使う。
  if (!opaque || layers.length === 0) return base
  let [red, green, blue] = opaque
  for (let index = layers.length - 1; index >= 0; index -= 1) {
    const [r, g, b, alpha] = layers[index]!
    red = r * alpha + red * (1 - alpha)
    green = g * alpha + green * (1 - alpha)
    blue = b * alpha + blue * (1 - alpha)
  }
  return `rgb(${Math.round(red)}, ${Math.round(green)}, ${Math.round(blue)})`
}
