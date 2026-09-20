import { createContext, useContext, useMemo, useState, type ReactNode } from "react"
import { useLocation } from "react-router"
import type { MenuItem } from "@/stores/route"
import { findMenuPath, reconcileExpandedKeys, resolveSelectedMenuKey } from "./sidebar-menu-selection"

interface SidebarMenuContextValue {
  collapsed: boolean
  expandedKeys: ReadonlySet<string>
  selectedKey: string | null
  selectedPath: readonly string[]
  closeTransientSurface: () => void
  inFlyout: boolean
  isExpanded: (key: string) => boolean
  setGroupExpanded: (key: string, expanded: boolean) => void
}

const SidebarMenuContext = createContext<SidebarMenuContextValue | null>(null)

interface SidebarMenuExpansionState {
  keys: Set<string>
  scope: string
}

export function useSidebarMenu() {
  const value = useContext(SidebarMenuContext)
  if (!value) throw new Error("useSidebarMenu must be used within SidebarMenuProvider")
  return value
}

export function SidebarMenuProvider({
  children,
  collapsed,
  menus,
  currentRoute,
  onNavigateComplete,
  inFlyout = false,
}: {
  children: ReactNode
  collapsed: boolean
  menus: MenuItem[]
  currentRoute?: MenuItem
  onNavigateComplete?: () => void
  inFlyout?: boolean
}) {
  const { pathname } = useLocation()
  const selectedKey = useMemo(
    () => resolveSelectedMenuKey({ currentRoute, menus, pathname }),
    [currentRoute, menus, pathname],
  )
  const selectedPath = useMemo(() => (selectedKey ? findMenuPath(menus, selectedKey) : []), [menus, selectedKey])
  const expansionScope = `${collapsed ? "collapsed" : "expanded"}\0${pathname}\0${selectedPath.join("\0")}`
  const [expansionState, setExpansionState] = useState<SidebarMenuExpansionState>(() => ({
    keys: reconcileExpandedKeys({ collapsed, current: new Set(), selectedPath, restoreSelectedPath: true }),
    scope: expansionScope,
  }))

  let expandedKeys = expansionState.keys
  if (expansionState.scope !== expansionScope) {
    expandedKeys = reconcileExpandedKeys({
      collapsed,
      current: expansionState.keys,
      selectedPath,
      restoreSelectedPath: true,
    })
    setExpansionState({ keys: expandedKeys, scope: expansionScope })
  }

  const value = useMemo<SidebarMenuContextValue>(
    () => ({
      collapsed,
      expandedKeys,
      selectedKey,
      selectedPath,
      closeTransientSurface: onNavigateComplete ?? (() => undefined),
      inFlyout,
      isExpanded: (key) => expandedKeys.has(key),
      setGroupExpanded: (key, expanded) =>
        setExpansionState((current) => {
          const next = new Set(current.keys)
          if (expanded) next.add(key)
          else next.delete(key)
          return { ...current, keys: next }
        }),
    }),
    [collapsed, expandedKeys, inFlyout, onNavigateComplete, selectedKey, selectedPath],
  )

  return <SidebarMenuContext.Provider value={value}>{children}</SidebarMenuContext.Provider>
}
