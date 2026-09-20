import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { matchPath, useLocation } from "react-router"
import type { LayoutMode } from "@/features/theme/theme-config"
import { useAppStore } from "@/stores/app"
import { useRouteStore, type MenuItem } from "@/stores/route"
import { getVisibleChildren } from "../sidebar/sidebar-menu-selection"
import { projectMenus, type MenuProjection } from "./menu-projection"

interface MenuContextValue extends MenuProjection {
  activeFirstLevelKey: string | null
  activeSecondLevelKey: string | null
  childPanelOpen: boolean
  selectFirstLevel: (key: string) => MenuItem | null
  selectSecondLevel: (key: string) => MenuItem | null
  setChildPanelOpen: (open: boolean) => void
  resetTransientSelection: () => void
}

const MenuContext = createContext<MenuContextValue | null>(null)

export function useLayoutMenu() {
  const context = useContext(MenuContext)
  if (!context) throw new Error("useLayoutMenu must be used within MenuProvider")
  return context
}

export function MenuProvider({ children, layoutMode }: { children: ReactNode; layoutMode: LayoutMode }) {
  const { pathname } = useLocation()
  const menus = useRouteStore((state) => state.menus)
  const flat = useRouteStore((state) => state.flat)
  const mixSiderFixed = useAppStore((state) => state.mixSiderFixed)
  const currentRoute = useMemo(
    () =>
      flat[pathname] ??
      Object.entries(flat).find(([pattern]) => matchPath({ path: pattern, end: true }, pathname))?.[1],
    [flat, pathname],
  )
  const routeProjection = useMemo(
    () => projectMenus({ menus, pathname, currentRoute }),
    [currentRoute, menus, pathname],
  )
  const routeFirstKey = routeProjection.activeFirstLevel?.key ?? null
  const routeSecondKey = routeProjection.activeSecondLevel?.key ?? null
  const [activeFirstLevelKey, setActiveFirstLevelKey] = useState(routeFirstKey)
  const [activeSecondLevelKey, setActiveSecondLevelKey] = useState(routeSecondKey)
  const [childPanelOpen, setChildPanelOpen] = useState(false)

  useEffect(() => {
    setActiveFirstLevelKey(routeFirstKey)
    setActiveSecondLevelKey(routeSecondKey)
    setChildPanelOpen(false)
  }, [layoutMode, pathname, routeFirstKey, routeSecondKey])

  const activeFirstLevel =
    routeProjection.firstLevelMenus.find((item) => item.key === activeFirstLevelKey) ?? routeProjection.activeFirstLevel
  const secondLevelMenus = activeFirstLevel ? getVisibleChildren(activeFirstLevel) : []
  const activeSecondLevel =
    secondLevelMenus.find((item) => item.key === activeSecondLevelKey) ?? routeProjection.activeSecondLevel
  const childLevelMenus = activeSecondLevel ? getVisibleChildren(activeSecondLevel) : []

  function selectFirstLevel(key: string): MenuItem | null {
    const selected = routeProjection.firstLevelMenus.find((item) => item.key === key) ?? null
    setActiveFirstLevelKey(selected?.key ?? null)
    setActiveSecondLevelKey(selected ? (getVisibleChildren(selected)[0]?.key ?? null) : null)
    setChildPanelOpen(Boolean(selected && getVisibleChildren(selected).length))
    return selected
  }

  function selectSecondLevel(key: string): MenuItem | null {
    const selected = secondLevelMenus.find((item) => item.key === key) ?? null
    setActiveSecondLevelKey(selected?.key ?? null)
    setChildPanelOpen(Boolean(selected && getVisibleChildren(selected).length))
    return selected
  }

  function resetTransientSelection() {
    if (mixSiderFixed) return
    setActiveFirstLevelKey(routeFirstKey)
    setActiveSecondLevelKey(routeSecondKey)
    setChildPanelOpen(false)
  }

  const value: MenuContextValue = {
    ...routeProjection,
    activeFirstLevel,
    secondLevelMenus,
    activeSecondLevel,
    childLevelMenus,
    activeFirstLevelKey,
    activeSecondLevelKey,
    childPanelOpen,
    selectFirstLevel,
    selectSecondLevel,
    setChildPanelOpen,
    resetTransientSelection,
  }

  return <MenuContext.Provider value={value}>{children}</MenuContext.Provider>
}
