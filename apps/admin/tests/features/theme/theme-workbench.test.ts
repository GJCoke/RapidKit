import { expect, test } from "vitest"
import { defaultThemeConfig } from "@/features/theme/theme-config"
import { isStructuralThemeChange } from "@/features/theme/theme-workbench"

test("style, icon, and font changes require component regeneration", () => {
  expect(isStructuralThemeChange(defaultThemeConfig, defaultThemeConfig)).toBe(false)
  expect(
    isStructuralThemeChange(
      { ...defaultThemeConfig, shadcn: { ...defaultThemeConfig.shadcn, iconLibrary: "tabler" } },
      defaultThemeConfig,
    ),
  ).toBe(true)
})
