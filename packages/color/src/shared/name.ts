import { colorNames } from "../constant"
import { getHex, getHsl, getRgb } from "./colord"

/**
 * Get color name
 *
 * @param color
 */
export function getColorName(color: string) {
  const hex = getHex(color)
  const rgb = getRgb(color)
  const hsl = getHsl(color)

  let cl = -1
  let df = -1

  for (const [index, [hexValue, colorName]] of colorNames.entries()) {
    if (hex === hexValue) {
      return colorName
    }

    const { r, g, b } = getRgb(hexValue)
    const { h, s, l } = getHsl(hexValue)

    const ndf1 = (rgb.r - r) ** 2 + (rgb.g - g) ** 2 + (rgb.b - b) ** 2
    const ndf2 = (hsl.h - h) ** 2 + (hsl.s - s) ** 2 + (hsl.l - l) ** 2
    const ndf = ndf1 + ndf2 * 2

    if (df < 0 || df > ndf) {
      df = ndf
      cl = index
    }
  }

  return colorNames[cl][1]
}
