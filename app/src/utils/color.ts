/**
 * Picks readable text color (near-black or near-white) against a given hex
 * background, via relative luminance (WCAG-style approximation). Needed because
 * pad colors span the full palette — white text reads fine on the reds/blues/purples
 * but is illegible on the yellow.
 */
export function contrastingTextColor(hex: string): '#12121a' | '#ffffff' {
  const { r, g, b } = hexToRgb(hex)
  const luminance = relativeLuminance(r, g, b)
  return luminance > 0.55 ? '#12121a' : '#ffffff'
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace('#', '')
  const r = parseInt(normalized.slice(0, 2), 16)
  const g = parseInt(normalized.slice(2, 4), 16)
  const b = parseInt(normalized.slice(4, 6), 16)
  return { r, g, b }
}

function relativeLuminance(r: number, g: number, b: number): number {
  const [rl, gl, bl] = [r, g, b].map((channel) => {
    const normalized = channel / 255
    return normalized <= 0.03928 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4)
  }) as [number, number, number]
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl
}
