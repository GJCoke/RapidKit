import type { AdminThemeConfig } from "./theme-config"

interface Rgb {
  r: number
  g: number
  b: number
}

function parseHex(value: string): Rgb | null {
  const match = /^#([\da-f]{6})$/i.exec(value.trim())
  if (!match) return null
  const number = Number.parseInt(match[1], 16)
  return { r: (number >> 16) & 255, g: (number >> 8) & 255, b: number & 255 }
}

const linear = (value: number) => {
  const channel = value / 255
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
}

function relativeLuminance(rgb: Rgb) {
  return 0.2126 * linear(rgb.r) + 0.7152 * linear(rgb.g) + 0.0722 * linear(rgb.b)
}

export function getContrastRatio(first: string, second: string): number {
  const a = parseHex(first)
  const b = parseHex(second)
  if (!a || !b) return 0
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}

export function parseThemeColor(value: string) {
  const rgb = parseHex(value)
  if (!rgb) return null
  const r = linear(rgb.r)
  const g = linear(rgb.g)
  const b = linear(rgb.b)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const labB = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  const chroma = Math.sqrt(a * a + labB * labB)
  const hue = (Math.atan2(labB, a) * 180) / Math.PI
  const normalizedHue = hue < 0 ? hue + 360 : hue
  return {
    css: `oklch(${lightness.toFixed(3)} ${chroma.toFixed(3)} ${normalizedHue.toFixed(1)})`,
    hex: value.toLowerCase(),
    lightness,
    chroma,
    hue: normalizedHue,
  }
}

export function createCustomThemeTokens(value: string, base: AdminThemeConfig["tokens"]) {
  const color = parseThemeColor(value)
  if (!color) return null
  const whiteContrast = getContrastRatio(color.hex, "#ffffff")
  const blackContrast = getContrastRatio(color.hex, "#000000")
  const foreground = whiteContrast >= blackContrast ? "oklch(0.985 0 0)" : "oklch(0.18 0 0)"
  const contrast = Math.max(whiteContrast, blackContrast)
  const apply = (tokens: typeof base.light) => ({
    ...tokens,
    primary: color.css,
    primaryForeground: foreground,
    ring: color.css,
    sidebarPrimary: color.css,
    sidebarPrimaryForeground: foreground,
    chart1: color.css,
  })
  return {
    tokens: { light: apply(base.light), dark: apply(base.dark) },
    contrast: { light: contrast, dark: contrast },
    color,
  }
}
