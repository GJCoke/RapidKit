import { create } from "zustand"
import type { BackendRoute } from "@/services/api/route"

export interface MenuItem {
  key: string
  path: string
  title: string
  icon?: string
  order: number
  hideInMenu: boolean
  children?: MenuItem[]
}

interface RouteState {
  menus: MenuItem[]
  flat: Record<string, MenuItem>
  setRoutes: (routes: BackendRoute[]) => void
}

function normalize(routes: BackendRoute[], flat: Record<string, MenuItem>): MenuItem[] {
  return routes
    .map((r) => {
      const item: MenuItem = {
        key: r.name,
        path: r.path,
        title: r.meta?.title ?? r.name,
        icon: r.meta?.icon,
        order: r.meta?.order ?? 0,
        hideInMenu: r.meta?.hideInMenu ?? false,
        children: r.children?.length ? normalize(r.children, flat) : undefined,
      }
      flat[item.path] = item
      return item
    })
    .sort((a, b) => a.order - b.order)
}

export const useRouteStore = create<RouteState>((set) => ({
  menus: [],
  flat: {},
  setRoutes: (routes) => {
    const flat: Record<string, MenuItem> = {}
    const menus = normalize(routes, flat)
    set({ menus, flat })
  },
}))
