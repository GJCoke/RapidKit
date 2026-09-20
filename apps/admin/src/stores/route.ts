import { create } from "zustand"
import { EMPTY_ROUTE_SNAPSHOT, type NormalizedRoute, type RouteSnapshot } from "@/features/router/route-model"

export interface MenuItem {
  key: string
  path: string
  title: string
  i18nKey?: string
  icon?: string
  localIcon?: string
  activeMenu?: string
  href?: string
  order: number
  hideInMenu: boolean
  children?: MenuItem[]
}

interface RouteState {
  revision: number
  homeName: string
  snapshot: RouteSnapshot
  menus: MenuItem[]
  flat: Record<string, MenuItem>
  replaceSnapshot: (snapshot: RouteSnapshot, homeName?: string) => void
  clearRoutes: () => void
}

function projectMenus(routes: NormalizedRoute[], flat: Record<string, MenuItem>): MenuItem[] {
  const items: MenuItem[] = []
  routes.forEach((route) => {
    const item: MenuItem = {
      key: route.name,
      path: route.fullPath,
      title: route.title,
      ...(route.i18nKey ? { i18nKey: route.i18nKey } : {}),
      ...(route.icon ? { icon: route.icon } : {}),
      ...(route.localIcon ? { localIcon: route.localIcon } : {}),
      ...(route.activeMenu ? { activeMenu: route.activeMenu } : {}),
      ...(route.href ? { href: route.href } : {}),
      order: route.order,
      hideInMenu: route.hideInMenu,
      children: projectMenus(route.children, flat),
    }
    flat[item.path] = item
    if (!item.hideInMenu) items.push(item)
  })
  return items
}

export const useRouteStore = create<RouteState>((set) => ({
  revision: 0,
  homeName: "",
  snapshot: EMPTY_ROUTE_SNAPSHOT,
  menus: [],
  flat: {},
  replaceSnapshot: (snapshot, homeName = "") => {
    const flat: Record<string, MenuItem> = {}
    const menus = projectMenus(snapshot.tree, flat)
    set((state) => ({ revision: state.revision + 1, homeName, snapshot, menus, flat }))
  },
  clearRoutes: () =>
    set((state) => ({
      revision: state.revision + 1,
      homeName: "",
      snapshot: EMPTY_ROUTE_SNAPSHOT,
      menus: [],
      flat: {},
    })),
}))
