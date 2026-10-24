import { create } from "zustand"
import { createStore } from "zustand/vanilla"
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware"
import { isDefaultRouteCandidate, type NormalizedRoute, type RouteSnapshot } from "@/features/router/route-model"
import { createTabFromLocation, getRouteInstanceKey } from "@/features/router/route-instance-key"
import { defaultThemeConfig } from "@/features/theme/theme-config"

export interface Tab {
  key: string
  routeName: string
  label: string
  path: string
  icon?: string
  localIcon?: string
  fixedIndex?: number
  pinned?: boolean
  closable: boolean
}

export function isTabRemovable(tab: Pick<Tab, "pinned" | "fixedIndex"> & { closable?: boolean }) {
  return tab.closable !== false && tab.fixedIndex === undefined && !tab.pinned
}

interface TabState {
  tabs: Tab[]
  activeKey: string
  addTab: (tab: Tab) => void
  addLocation: (route: NormalizedRoute, pathSearch: string, translate?: (key: string) => string) => void
  removeTab: (key: string) => string[]
  removeTabs: (keys: string[]) => string[]
  closeLeftOf: (key: string) => string[]
  closeRightOf: (key: string) => string[]
  pinTab: (key: string) => void
  unpinTab: (key: string) => void
  setActiveKey: (key: string) => void
  setPersistenceEnabled: (enabled: boolean) => void
  syncAuthorizedRoutes: (snapshot: RouteSnapshot, home: string, translate?: (key: string) => string) => void
  clearTabs: () => void
}

type PersistedTabState = Pick<TabState, "tabs" | "activeKey">

const TAB_STORAGE_NAME = "admin-tabs"

const unavailableStorage: StateStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
}

function browserStorage(): StateStorage {
  if (typeof window === "undefined") return unavailableStorage
  try {
    return window.localStorage
  } catch {
    return unavailableStorage
  }
}

function controlledStorage(storage: StateStorage, initiallyEnabled: boolean) {
  let enabled = initiallyEnabled
  const removePersistedTabs = () => {
    try {
      return storage.removeItem(TAB_STORAGE_NAME)
    } catch {
      return undefined
    }
  }

  if (!enabled) removePersistedTabs()

  return {
    storage: {
      getItem: (name: string) => {
        if (!enabled) return null
        try {
          return storage.getItem(name)
        } catch {
          return null
        }
      },
      setItem: (name: string, value: string) => {
        if (!enabled) return undefined
        try {
          return storage.setItem(name, value)
        } catch {
          return undefined
        }
      },
      removeItem: (name: string) => {
        try {
          return storage.removeItem(name)
        } catch {
          return undefined
        }
      },
    } satisfies StateStorage,
    setEnabled(nextEnabled: boolean) {
      enabled = nextEnabled
      if (!enabled) removePersistedTabs()
    },
  }
}

function findHome(snapshot: RouteSnapshot, homeName: string): NormalizedRoute | undefined {
  const configured = snapshot.byName[homeName]
  if (configured && isDefaultRouteCandidate(configured)) return configured
  return Object.values(snapshot.byName).find(isDefaultRouteCandidate)
}

function sortTabs(tabs: Tab[]) {
  return [...tabs].sort((a, b) => {
    if (a.fixedIndex !== undefined && b.fixedIndex !== undefined) return a.fixedIndex - b.fixedIndex
    if (a.fixedIndex !== undefined) return -1
    if (b.fixedIndex !== undefined) return 1
    if (a.pinned && !b.pinned) return -1
    if (!a.pinned && b.pinned) return 1
    return 0
  })
}

function rebuildTab(tab: Tab, route: NormalizedRoute, translate?: (key: string) => string): Tab | null {
  if (route.kind === "external" || route.kind === "layout") return null
  const rebuilt = createTabFromLocation(route, tab.path, translate)
  const nextTab = route.multiTab || rebuilt.key === tab.key ? rebuilt : { ...rebuilt, path: tab.path }
  return tab.pinned && nextTab.fixedIndex === undefined ? { ...nextTab, pinned: true } : nextTab
}

export function resolveAuthorizedTabState(
  tabs: Tab[],
  activeKey: string,
  snapshot: RouteSnapshot,
  homeName: string,
  translate?: (key: string) => string,
) {
  const homeRoute = findHome(snapshot, homeName)
  if (!homeRoute) return { tabs: [], activeKey: "" }

  const home = {
    ...createTabFromLocation(homeRoute, `${homeRoute.fullPath}${homeRoute.defaultSearch}`, translate),
    fixedIndex: -1,
    closable: false,
  }
  const restored = tabs
    .filter((tab) => tab.routeName !== home.routeName)
    .map((tab) => {
      const route = snapshot.byName[tab.routeName]
      return route ? rebuildTab(tab, route, translate) : null
    })
    .filter((tab): tab is Tab => tab !== null)
  const nextTabs = sortTabs([home, ...restored])
  const nextActiveKey = nextTabs.some((tab) => tab.key === activeKey) ? activeKey : home.key
  return { tabs: nextTabs, activeKey: nextActiveKey }
}

function tabStore(storage: StateStorage, persistenceEnabled: boolean) {
  const persistence = controlledStorage(storage, persistenceEnabled)

  return persist<TabState, [], [], PersistedTabState>(
    (set, get) => ({
      tabs: [],
      activeKey: "",
      addTab: (tab) => {
        const { tabs } = get()
        const existing = tabs.some((item) => item.key === tab.key)
        set({ tabs: existing ? tabs : sortTabs([...tabs, tab]), activeKey: tab.key })
      },
      addLocation: (route, pathSearch, translate) => get().addTab(createTabFromLocation(route, pathSearch, translate)),
      removeTab: (key) => get().removeTabs([key]),
      removeTabs: (keys) => {
        const { tabs, activeKey } = get()
        const removable = new Set(keys.filter((key) => tabs.some((tab) => tab.key === key && isTabRemovable(tab))))
        if (!removable.size) return []
        const removedTabs = tabs.filter((tab) => removable.has(tab.key))
        const nextTabs = tabs.filter((tab) => !removable.has(tab.key))
        const removedIndex = tabs.findIndex((tab) => removable.has(tab.key))
        const nextActive = removable.has(activeKey)
          ? (nextTabs[Math.min(removedIndex, nextTabs.length - 1)]?.key ?? nextTabs[0]?.key ?? "")
          : activeKey
        set({ tabs: nextTabs, activeKey: nextActive })
        return removedTabs.map((tab) => tab.key)
      },
      closeLeftOf: (key) => {
        const { tabs } = get()
        const tabIndex = tabs.findIndex((tab) => tab.key === key)
        if (tabIndex < 0) return []
        return get().removeTabs(
          tabs
            .slice(0, tabIndex)
            .filter(isTabRemovable)
            .map((tab) => tab.key),
        )
      },
      closeRightOf: (key) => {
        const { tabs } = get()
        const tabIndex = tabs.findIndex((tab) => tab.key === key)
        if (tabIndex < 0) return []
        return get().removeTabs(
          tabs
            .slice(tabIndex + 1)
            .filter(isTabRemovable)
            .map((tab) => tab.key),
        )
      },
      pinTab: (key) => {
        const { tabs } = get()
        const tab = tabs.find((item) => item.key === key)
        if (!tab || tab.fixedIndex !== undefined || tab.pinned) return
        set({ tabs: sortTabs(tabs.map((item) => (item.key === key ? { ...item, pinned: true } : item))) })
      },
      unpinTab: (key) => {
        const { tabs } = get()
        const tab = tabs.find((item) => item.key === key)
        if (!tab || tab.fixedIndex !== undefined || !tab.pinned) return
        set({ tabs: sortTabs(tabs.map((item) => (item.key === key ? { ...item, pinned: undefined } : item))) })
      },
      setActiveKey: (activeKey) => set({ activeKey }),
      setPersistenceEnabled: (enabled) => {
        persistence.setEnabled(enabled)
        if (enabled) set({})
      },
      syncAuthorizedRoutes: (snapshot, home, translate) => {
        const { tabs, activeKey } = get()
        set(resolveAuthorizedTabState(tabs, activeKey, snapshot, home, translate))
      },
      clearTabs: () => set({ tabs: [], activeKey: "" }),
    }),
    {
      name: TAB_STORAGE_NAME,
      version: 2,
      storage: createJSONStorage<PersistedTabState>(() => persistence.storage),
      partialize: (state) => ({ tabs: state.tabs, activeKey: state.activeKey }),
    },
  )
}

export function createTabStore(storage: StateStorage, persistenceEnabled = true) {
  return createStore<TabState>()(tabStore(storage, persistenceEnabled))
}

export const useTabStore = create<TabState>()(tabStore(browserStorage(), defaultThemeConfig.experience.restoreTabs))

export { getRouteInstanceKey }
