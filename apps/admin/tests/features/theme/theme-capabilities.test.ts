import { expect, test } from "vitest"
import { themeCapabilities, themeWorkbenchRuntimeFields } from "@/features/theme/theme-capabilities"

test("every runtime workbench field has one observable owner", () => {
  expect(themeCapabilities).toHaveLength(themeWorkbenchRuntimeFields.length)
  expect(new Set(themeCapabilities.map(({ field }) => field))).toEqual(new Set(themeWorkbenchRuntimeFields))
  expect(new Set(themeCapabilities.map(({ field }) => field)).size).toBe(themeCapabilities.length)

  expect(themeCapabilities).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        field: "appearance.preset",
        runtimeOwner: "theme-provider",
        observable: "resolved semantic CSS variables",
      }),
      expect.objectContaining({
        field: "appearance.customPrimary",
        runtimeOwner: "theme-provider",
        observable: "applied custom semantic CSS variables",
      }),
      expect.objectContaining({
        field: "appearance.radius",
        runtimeOwner: "theme-provider",
        observable: "document root data-radius attribute",
      }),
      expect.objectContaining({
        field: "layout.sidebarVariant",
        runtimeOwner: "theme-provider",
        observable: "document root data-sidebar attribute",
      }),
      expect.objectContaining({
        field: "layout.density",
        runtimeOwner: "theme-provider",
        observable: "document root data-density attribute",
      }),
      expect.objectContaining({
        field: "layout.contentWidth",
        runtimeOwner: "theme-provider",
        observable: "document root data-content-width attribute",
      }),
      expect.objectContaining({ field: "layout.fixedHeaderTabs", runtimeOwner: "layout" }),
      expect.objectContaining({ field: "layout.defaultSidebarCollapsed", runtimeOwner: "layout" }),
      expect.objectContaining({ field: "sidebar.autoSelectFirstMenu", runtimeOwner: "menu" }),
      expect.objectContaining({ field: "experience.pageMotion", runtimeOwner: "route-transition" }),
      expect.objectContaining({ field: "experience.motionPreset", runtimeOwner: "route-transition" }),
      expect.objectContaining({ field: "experience.navigationProgress", runtimeOwner: "route-transition" }),
      expect.objectContaining({ field: "experience.restoreTabs", runtimeOwner: "tabs" }),
      expect.objectContaining({ field: "experience.grayscale", runtimeOwner: "theme-provider" }),
      expect.objectContaining({ field: "experience.colorVisionAssist", runtimeOwner: "theme-provider" }),
    ]),
  )
})
