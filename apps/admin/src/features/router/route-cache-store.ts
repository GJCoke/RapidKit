import { create } from "zustand"

export interface RouteCacheMeta {
  cacheKey: string
  routeName: string
  generation: number
  lastAccessedAt: number
  fixed: boolean
}

export interface RegisterCacheInput {
  cacheKey: string
  routeName: string
  fixed: boolean
  now?: number
}

interface RouteCacheState {
  capacity: number
  entries: Record<string, RouteCacheMeta>
  activeKey: string | null
  refreshGenerations: Record<string, number>
  pendingRefreshKey: string | null
  register: (input: RegisterCacheInput) => string[]
  activate: (cacheKey: string, now?: number) => void
  refresh: (cacheKey: string) => void
  requestRefresh: (cacheKey: string) => void
  completeRefresh: () => void
  evict: (keys: string[]) => void
  reconcile: (validKeys: ReadonlySet<string>) => void
  clear: () => void
}

function chooseLru(entries: Record<string, RouteCacheMeta>, activeKey: string | null) {
  return Object.values(entries)
    .filter((entry) => !entry.fixed && entry.cacheKey !== activeKey)
    .sort((a, b) => a.lastAccessedAt - b.lastAccessedAt || a.cacheKey.localeCompare(b.cacheKey))[0]
}

export const useRouteCacheStore = create<RouteCacheState>((set, get) => ({
  capacity: 10,
  entries: {},
  activeKey: null,
  refreshGenerations: {},
  pendingRefreshKey: null,
  register: ({ cacheKey, routeName, fixed, now = Date.now() }) => {
    const state = get()
    if (state.entries[cacheKey]) return []
    const entries = { ...state.entries }
    const evicted: string[] = []
    if (Object.keys(entries).length >= state.capacity) {
      const lru = chooseLru(entries, state.activeKey)
      if (!lru) return [cacheKey]
      delete entries[lru.cacheKey]
      evicted.push(lru.cacheKey)
    }
    entries[cacheKey] = { cacheKey, routeName, generation: 0, lastAccessedAt: now, fixed }
    set({ entries })
    return evicted
  },
  activate: (cacheKey, now = Date.now()) =>
    set((state) => {
      const entry = state.entries[cacheKey]
      return {
        activeKey: entry ? cacheKey : null,
        entries: entry ? { ...state.entries, [cacheKey]: { ...entry, lastAccessedAt: now } } : state.entries,
      }
    }),
  refresh: (cacheKey) =>
    set((state) => {
      const entry = state.entries[cacheKey]
      return {
        refreshGenerations: {
          ...state.refreshGenerations,
          [cacheKey]: (state.refreshGenerations[cacheKey] ?? 0) + 1,
        },
        entries: entry
          ? { ...state.entries, [cacheKey]: { ...entry, generation: entry.generation + 1 } }
          : state.entries,
      }
    }),
  requestRefresh: (pendingRefreshKey) => set((state) => (state.pendingRefreshKey ? state : { pendingRefreshKey })),
  completeRefresh: () => set({ pendingRefreshKey: null }),
  evict: (keys) =>
    set((state) => {
      const entries = { ...state.entries }
      keys.forEach((key) => delete entries[key])
      return { entries, activeKey: keys.includes(state.activeKey ?? "") ? null : state.activeKey }
    }),
  reconcile: (validKeys) =>
    set((state) => {
      const entries = Object.fromEntries(Object.entries(state.entries).filter(([key]) => validKeys.has(key)))
      return { entries, activeKey: state.activeKey && validKeys.has(state.activeKey) ? state.activeKey : null }
    }),
  clear: () => set({ entries: {}, activeKey: null, refreshGenerations: {}, pendingRefreshKey: null }),
}))
