import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { useAppStore } from "@/stores/app"

beforeEach(() => {
  useAppStore.setState({
    siderCollapse: false,
    desktopSiderCollapse: false,
    hasUserSetSiderCollapse: false,
    isMobile: false,
    mobileNavOpen: false,
    mixSiderFixed: false,
    fullContent: false,
    themeWorkbenchOpen: false,
    themeWorkbenchTab: "design",
  })
})

afterEach(() => vi.unstubAllGlobals())

test("mixed sidebar pinning is independent from collapse state", () => {
  useAppStore.getState().toggleMixSiderFixed()
  expect(useAppStore.getState().mixSiderFixed).toBe(true)
  expect(useAppStore.getState().desktopSiderCollapse).toBe(false)
  useAppStore.getState().setMixSiderFixed(false)
  expect(useAppStore.getState().mixSiderFixed).toBe(false)
})

test("mixed sidebar pinning persists separately", () => {
  const setItem = vi.fn()
  vi.stubGlobal("localStorage", { getItem: vi.fn(), setItem, removeItem: vi.fn() })
  useAppStore.getState().setMixSiderFixed(true)
  expect(setItem).toHaveBeenCalledWith("rapidkit:mix-sider-fixed", "true")
})

test("mobile round trip restores the user's desktop collapse state", () => {
  useAppStore.getState().toggleSider()
  useAppStore.getState().setIsMobile(true)
  expect(useAppStore.getState().desktopSiderCollapse).toBe(true)
  useAppStore.getState().setIsMobile(false)
  expect(useAppStore.getState().siderCollapse).toBe(true)
})

test("theme defaults stop overriding an explicit user choice", () => {
  useAppStore.getState().setSiderCollapse(true, "theme")
  expect(useAppStore.getState().siderCollapse).toBe(true)
  useAppStore.getState().toggleSider()
  useAppStore.getState().setSiderCollapse(true, "theme")
  expect(useAppStore.getState().siderCollapse).toBe(false)
})

test("content fullscreen toggles without changing sidebar state", () => {
  useAppStore.getState().setSiderCollapse(true)
  useAppStore.getState().toggleFullContent()

  expect(useAppStore.getState().fullContent).toBe(true)
  expect(useAppStore.getState().siderCollapse).toBe(true)

  useAppStore.getState().setFullContent(false)
  expect(useAppStore.getState().fullContent).toBe(false)
  expect(useAppStore.getState().siderCollapse).toBe(true)
})

test("theme workbench visibility survives component remounts as runtime UI state", () => {
  useAppStore.getState().setThemeWorkbenchOpen(true)
  expect(useAppStore.getState().themeWorkbenchOpen).toBe(true)

  useAppStore.getState().setThemeWorkbenchOpen(false)
  expect(useAppStore.getState().themeWorkbenchOpen).toBe(false)
})

test("theme workbench active tab survives component remounts as runtime UI state", () => {
  useAppStore.getState().setThemeWorkbenchTab("layout")
  expect(useAppStore.getState().themeWorkbenchTab).toBe("layout")
})
