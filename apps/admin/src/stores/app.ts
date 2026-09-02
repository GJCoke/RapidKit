import { create } from "zustand"

interface AppState {
  siderCollapse: boolean
  isMobile: boolean
  mobileNavOpen: boolean
  contentScrollTop: number
  toggleSider: () => void
  setSiderCollapse: (v: boolean) => void
  setIsMobile: (v: boolean) => void
  setMobileNavOpen: (v: boolean) => void
  setContentScrollTop: (v: number) => void
}

export const useAppStore = create<AppState>((set) => ({
  siderCollapse: false,
  isMobile: false,
  mobileNavOpen: false,
  contentScrollTop: 0,
  toggleSider: () => set((s) => ({ siderCollapse: !s.siderCollapse })),
  setSiderCollapse: (v) => set({ siderCollapse: v }),
  setIsMobile: (v) => set({ isMobile: v }),
  setMobileNavOpen: (v) => set({ mobileNavOpen: v }),
  setContentScrollTop: (v) => set({ contentScrollTop: v }),
}))
