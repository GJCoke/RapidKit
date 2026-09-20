import { expect, test } from "vitest"
import { themePresets, themeWorkbenchOptions } from "@/features/theme/theme-presets"

test("six presets provide complete light and dark semantic tokens", () => {
  expect(Object.keys(themePresets)).toEqual(["cloud-indigo", "ocean", "mineral", "violet", "rose", "amber"])
  for (const preset of Object.values(themePresets)) {
    expect(Object.keys(preset.tokens.light)).toHaveLength(Object.keys(preset.tokens.dark).length)
    expect(preset.tokens.light.primary).toMatch(/^oklch\(/)
    expect(preset.tokens.dark.primary).toMatch(/^oklch\(/)
  }
})

test("Base UI is the only primitive option", () => {
  expect(themeWorkbenchOptions.bases).toEqual([{ value: "base", label: "Base UI" }])
  expect(themeWorkbenchOptions.baseColors).toContain("neutral")
  expect(themeWorkbenchOptions.themes).toContain("indigo")
  expect(themeWorkbenchOptions.chartColors).toContain("indigo")
  expect(themeWorkbenchOptions.menuColors).toContain("default")
  expect(themeWorkbenchOptions.menuAccents).toContain("subtle")
})
