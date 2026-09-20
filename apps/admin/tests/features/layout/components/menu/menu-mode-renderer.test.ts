import { expect, test } from "vitest"
import { defaultThemeConfig } from "@/features/theme/theme-config"
import { resolveLayoutRegions } from "@/features/layout/components/menu/menu-mode-renderer"

test("resolves standard, horizontal, and fixed mixed geometry", () => {
  expect(
    resolveLayoutRegions({
      mode: "vertical",
      collapsed: false,
      activeFirstHasChildren: true,
      mixSiderFixed: false,
      sidebar: defaultThemeConfig.sidebar,
    }),
  ).toMatchObject({ sidebarVisible: true, sidebarWidth: 220, headerMenu: "none", sidebarMenu: "all" })

  expect(
    resolveLayoutRegions({
      mode: "horizontal",
      collapsed: true,
      activeFirstHasChildren: true,
      mixSiderFixed: false,
      sidebar: defaultThemeConfig.sidebar,
    }),
  ).toMatchObject({ sidebarVisible: false, sidebarWidth: 0, showLogo: true, headerMenu: "all" })

  expect(
    resolveLayoutRegions({
      mode: "vertical-mix",
      collapsed: false,
      activeFirstHasChildren: true,
      mixSiderFixed: true,
      sidebar: defaultThemeConfig.sidebar,
    }),
  ).toMatchObject({ sidebarWidth: 290, sidebarKind: "mixed-first", sidebarMenu: "first-level" })
})

test("top hybrid header-first hides an empty child sidebar", () => {
  expect(
    resolveLayoutRegions({
      mode: "top-hybrid-header-first",
      collapsed: false,
      activeFirstHasChildren: false,
      mixSiderFixed: false,
      sidebar: defaultThemeConfig.sidebar,
    }),
  ).toMatchObject({ sidebarVisible: false, sidebarWidth: 0, showSidebarToggle: false })
})

test("vertical hybrid header-first hides its second-level sidebar for a first-level leaf", () => {
  expect(
    resolveLayoutRegions({
      mode: "vertical-hybrid-header-first",
      collapsed: false,
      activeFirstHasChildren: false,
      mixSiderFixed: false,
      sidebar: defaultThemeConfig.sidebar,
    }),
  ).toMatchObject({ sidebarVisible: false, sidebarWidth: 0, showLogo: true })
})

test("all layout modes expose a branch control that can honor auto-select", () => {
  const expected = {
    vertical: { headerMenu: "none", sidebarMenu: "all" },
    "vertical-mix": { headerMenu: "none", sidebarMenu: "first-level" },
    "vertical-hybrid-header-first": { headerMenu: "first-level", sidebarMenu: "second-level" },
    horizontal: { headerMenu: "all", sidebarMenu: "none" },
    "top-hybrid-sidebar-first": { headerMenu: "active-children", sidebarMenu: "first-level" },
    "top-hybrid-header-first": { headerMenu: "first-level", sidebarMenu: "active-children" },
  } as const

  for (const [mode, projection] of Object.entries(expected)) {
    expect(
      resolveLayoutRegions({
        mode: mode as keyof typeof expected,
        collapsed: false,
        activeFirstHasChildren: true,
        mixSiderFixed: false,
        sidebar: defaultThemeConfig.sidebar,
      }),
    ).toMatchObject(projection)
  }
})
