import { expect, test } from "vitest"
import { defaultThemeConfig } from "@/features/theme/theme-config"
import type { AdminThemeConfig, LayoutMode } from "@/features/theme/theme-config"
import { getThemeCssVariables, getThemeRootState, resolveThemeConfig } from "@/features/theme/theme-resolver"

test("invalid fields fall back independently", () => {
  const resolved = resolveThemeConfig({
    ...defaultThemeConfig,
    appearance: { ...defaultThemeConfig.appearance, radius: "unknown" as never },
    layout: { ...defaultThemeConfig.layout, contentWidth: "centered" },
  })

  expect(resolved.appearance.radius).toBe("default")
  expect(resolved.layout.contentWidth).toBe("centered")
})

test("preview state maps to stable document attributes", () => {
  expect(getThemeRootState(defaultThemeConfig, true)).toMatchObject({
    "data-theme": "cloud-indigo",
    "data-density": "comfortable",
    "data-sidebar": "standard",
    "data-layout-mode": "vertical",
    "data-motion": "fade-slide",
    "data-theme-preview": "true",
  })
})

test("semantic tokens become CSS custom properties", () => {
  const variables = getThemeCssVariables(defaultThemeConfig, "light")
  expect(variables["--primary"]).toBe(defaultThemeConfig.tokens.light.primary)
  expect(variables["--sidebar-primary"]).toBe(defaultThemeConfig.tokens.light.sidebarPrimary)
})

test.each([
  "vertical",
  "vertical-mix",
  "vertical-hybrid-header-first",
  "horizontal",
  "top-hybrid-sidebar-first",
  "top-hybrid-header-first",
] satisfies LayoutMode[])("resolves layout mode %s", (mode) => {
  const resolved = resolveThemeConfig({
    ...defaultThemeConfig,
    layout: { ...defaultThemeConfig.layout, mode },
  })
  expect(resolved.layout.mode).toBe(mode)
})

test("invalid and legacy layout settings receive safe defaults", () => {
  const legacy = structuredClone(defaultThemeConfig) as Partial<AdminThemeConfig> & {
    layout: Partial<AdminThemeConfig["layout"]>
  }
  legacy.layout.mode = "invalid" as LayoutMode
  delete legacy.sidebar

  const resolved = resolveThemeConfig(legacy as AdminThemeConfig)
  expect(resolved.layout.mode).toBe("vertical")
  expect(resolved.sidebar).toEqual(defaultThemeConfig.sidebar)
})
