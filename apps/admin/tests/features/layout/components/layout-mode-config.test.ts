import { describe, expect, test } from "vitest"
import type { LayoutMode } from "@/features/theme/theme-config"
import { layoutModeConfigs, resolveLayoutModeConfig } from "@/features/layout/components/layout-mode-config"

describe("layoutModeConfigs", () => {
  test("covers all six frontend layout modes", () => {
    expect(Object.keys(layoutModeConfigs)).toEqual([
      "vertical",
      "vertical-mix",
      "vertical-hybrid-header-first",
      "horizontal",
      "top-hybrid-sidebar-first",
      "top-hybrid-header-first",
    ] satisfies LayoutMode[])
  })

  test.each([
    ["vertical", "none", "all", "never", "always"],
    ["vertical-mix", "none", "first-level", "never", "never"],
    ["vertical-hybrid-header-first", "first-level", "second-level", "when-active-first-leaf", "never"],
    ["horizontal", "all", "none", "always", "never"],
    ["top-hybrid-sidebar-first", "active-children", "first-level", "always", "never"],
    ["top-hybrid-header-first", "first-level", "active-children", "always", "when-active-first-has-children"],
  ] as const)("maps %s to frontend regions", (mode, headerMenu, sidebarMenu, logo, sidebarToggle) => {
    const config = resolveLayoutModeConfig(mode)
    expect(config.header).toMatchObject({ menu: headerMenu, logo, sidebarToggle })
    expect(config.sidebar.menu).toBe(sidebarMenu)
    expect(config.sidebar.visible).toBe(sidebarMenu !== "none")
  })
})
