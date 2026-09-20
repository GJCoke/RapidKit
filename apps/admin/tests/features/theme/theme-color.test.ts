import { expect, test } from "vitest"
import { createCustomThemeTokens, getContrastRatio, parseThemeColor } from "@/features/theme/theme-color"
import { defaultThemeConfig } from "@/features/theme/theme-config"

test("valid hex colors normalize to OKLCH and malformed colors are rejected", () => {
  expect(parseThemeColor("#4f46e5")?.css).toMatch(/^oklch\(/)
  expect(parseThemeColor("not-a-color")).toBeNull()
})

test("contrast ratio follows WCAG relative luminance", () => {
  expect(getContrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1)
})

test("custom colors generate deterministic accessible light and dark tokens", () => {
  const first = createCustomThemeTokens("#4f46e5", defaultThemeConfig.tokens)
  const second = createCustomThemeTokens("#4f46e5", defaultThemeConfig.tokens)
  expect(first).toEqual(second)
  expect(first?.tokens.light.primaryForeground).toMatch(/oklch\((0\.18|0\.985)/)
  expect(first?.contrast.light).toBeGreaterThanOrEqual(4.5)
  expect(first?.contrast.dark).toBeGreaterThanOrEqual(4.5)
})
