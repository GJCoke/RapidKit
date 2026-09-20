import { expect, test } from "vitest"
import { defaultThemeConfig } from "@/features/theme/theme-config"
import { createThemeWorkbenchStore } from "@/stores/theme-workbench"

test("workbench edits stay in memory and can be reset", () => {
  const store = createThemeWorkbenchStore(defaultThemeConfig)
  store.getState().updateAppearance({ radius: "soft" })
  expect(store.getState().draft.appearance.radius).toBe("soft")
  store.getState().resetDraft()
  expect(store.getState().draft).toEqual(defaultThemeConfig)
})

test("preview can stop without deleting the draft", () => {
  const store = createThemeWorkbenchStore(defaultThemeConfig)
  store.getState().updateLayout({ sidebarVariant: "inset" })
  store.getState().setPreviewActive(false)
  expect(store.getState().previewActive).toBe(false)
  expect(store.getState().draft.layout.sidebarVariant).toBe("inset")
})

test("sidebar changes update only the sidebar draft", () => {
  const store = createThemeWorkbenchStore(defaultThemeConfig)
  store.getState().updateSidebar({ autoSelectFirstMenu: true })
  expect(store.getState().draft.sidebar.autoSelectFirstMenu).toBe(true)
  expect(store.getState().draft.layout).toEqual(defaultThemeConfig.layout)
})

test("export-only shadcn edits do not start a runtime preview", () => {
  const store = createThemeWorkbenchStore(defaultThemeConfig)
  store.getState().updateShadcn({ baseColor: "zinc" })
  expect(store.getState().draft.shadcn.baseColor).toBe("zinc")
  expect(store.getState().previewActive).toBe(false)
})
