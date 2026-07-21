import { create } from "zustand"
import { persist } from "zustand/middleware"

interface Tab {
  key: string
  label: string
  path: string
  closable?: boolean
}

interface TabState {
  tabs: Tab[]
  activeKey: string
  addTab: (tab: Tab) => void
  removeTab: (key: string) => void
  setActiveKey: (key: string) => void
  clearTabs: () => void
}

const HOME_TAB: Tab = { key: "home", label: "首页", path: "/home", closable: false }

export const useTabStore = create<TabState>()(
  persist(
    (set, get) => ({
      tabs: [HOME_TAB],
      activeKey: "home",
      addTab: (tab) => {
        const { tabs } = get()
        if (!tabs.some((t) => t.key === tab.key)) {
          set({ tabs: [...tabs, tab], activeKey: tab.key })
        } else {
          set({ activeKey: tab.key })
        }
      },
      removeTab: (key) => {
        const { tabs, activeKey } = get()
        const newTabs = tabs.filter((t) => t.key !== key)
        if (activeKey === key) {
          const idx = tabs.findIndex((t) => t.key === key)
          const newActive = newTabs[Math.min(idx, newTabs.length - 1)]?.key || "home"
          set({ tabs: newTabs, activeKey: newActive })
        } else {
          set({ tabs: newTabs })
        }
      },
      setActiveKey: (activeKey) => set({ activeKey }),
      clearTabs: () => set({ tabs: [HOME_TAB], activeKey: "home" }),
    }),
    {
      name: "admin-tabs",
    },
  ),
)
