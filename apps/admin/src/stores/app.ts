import { create } from "zustand"

const MIX_SIDER_FIXED_KEY = "rapidkit:mix-sider-fixed"

export type ThemeWorkbenchTab = "design" | "colors" | "layout" | "experience"

function readMixSiderFixed(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(MIX_SIDER_FIXED_KEY) === "true"
  } catch {
    return false
  }
}

function writeMixSiderFixed(value: boolean) {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(MIX_SIDER_FIXED_KEY, String(value))
  } catch {
    // Storage can be unavailable in restricted browser contexts.
  }
}

interface AppState {
  siderCollapse: boolean
  desktopSiderCollapse: boolean
  hasUserSetSiderCollapse: boolean
  isMobile: boolean
  mobileNavOpen: boolean
  contentScrollTop: number
  mixSiderFixed: boolean
  fullContent: boolean
  themeWorkbenchOpen: boolean
  themeWorkbenchTab: ThemeWorkbenchTab
  toggleSider: () => void
  setSiderCollapse: (v: boolean, source?: "user" | "theme") => void
  setIsMobile: (v: boolean) => void
  setMobileNavOpen: (v: boolean) => void
  setContentScrollTop: (v: number) => void
  setMixSiderFixed: (v: boolean) => void
  toggleMixSiderFixed: () => void
  setFullContent: (value: boolean) => void
  toggleFullContent: () => void
  setThemeWorkbenchOpen: (value: boolean) => void
  setThemeWorkbenchTab: (value: ThemeWorkbenchTab) => void
}

export const useAppStore = create<AppState>((set) => ({
  siderCollapse: false,
  desktopSiderCollapse: false,
  hasUserSetSiderCollapse: false,
  isMobile: false,
  mobileNavOpen: false,
  contentScrollTop: 0,
  mixSiderFixed: readMixSiderFixed(),
  fullContent: false,
  themeWorkbenchOpen: false,
  themeWorkbenchTab: "design",
  toggleSider: () =>
    set((state) => {
      const siderCollapse = !state.siderCollapse
      return { siderCollapse, desktopSiderCollapse: siderCollapse, hasUserSetSiderCollapse: true }
    }),
  setSiderCollapse: (v, source = "user") =>
    set((state) => {
      if (source === "theme" && state.hasUserSetSiderCollapse) return state
      return {
        siderCollapse: state.isMobile ? state.siderCollapse : v,
        desktopSiderCollapse: v,
        hasUserSetSiderCollapse: source === "user" ? true : state.hasUserSetSiderCollapse,
      }
    }),
  setIsMobile: (v) =>
    set((state) => ({
      isMobile: v,
      siderCollapse: v ? true : state.desktopSiderCollapse,
    })),
  setMobileNavOpen: (v) => set({ mobileNavOpen: v }),
  setContentScrollTop: (v) => set({ contentScrollTop: v }),
  setMixSiderFixed: (v) => {
    writeMixSiderFixed(v)
    set({ mixSiderFixed: v })
  },
  toggleMixSiderFixed: () =>
    set((state) => {
      const mixSiderFixed = !state.mixSiderFixed
      writeMixSiderFixed(mixSiderFixed)
      return { mixSiderFixed }
    }),
  setFullContent: (fullContent) => set({ fullContent }),
  toggleFullContent: () => set((state) => ({ fullContent: !state.fullContent })),
  setThemeWorkbenchOpen: (themeWorkbenchOpen) => set({ themeWorkbenchOpen }),
  setThemeWorkbenchTab: (themeWorkbenchTab) => set({ themeWorkbenchTab }),
}))
