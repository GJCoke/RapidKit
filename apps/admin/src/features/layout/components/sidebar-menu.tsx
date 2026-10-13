import { matchPath, useLocation } from "react-router"
import { useRouteStore, type MenuItem } from "@/stores/route"
import { SidebarMenuContent } from "./sidebar/sidebar-menu"
import { SidebarMenuProvider } from "./sidebar/sidebar-menu-provider"
import {
  getMenuButtonClasses as getControlledMenuButtonClasses,
  getMenuChevronClasses,
  getMenuLabelClasses,
  getSubmenuPanelClasses,
} from "./sidebar/sidebar-menu-styles"

export { getMenuChevronClasses, getMenuLabelClasses, getSubmenuPanelClasses }
export { findMenuPath, reconcileExpandedKeys, resolveSelectedMenuKey } from "./sidebar/sidebar-menu-selection"

export function getMenuButtonClasses(collapsed: boolean) {
  return getControlledMenuButtonClasses({ collapsed, active: false, branchActive: false })
}

export function isActive(item: MenuItem, pathname: string): boolean {
  return item.path === pathname || (item.children?.some((child) => isActive(child, pathname)) ?? false)
}

export function navigateToMenuItem(
  item: MenuItem,
  navigation: {
    navigate: (path: string) => void
    openExternal: (href: string, target: string, features: string) => unknown
    closeFlyout?: () => void
  },
) {
  if (item.href) navigation.openExternal(item.href, "_blank", "noopener,noreferrer")
  else navigation.navigate(item.path)
  navigation.closeFlyout?.()
}

export function resolveMenuGroupExpanded(current: boolean, branchActive: boolean, collapsed: boolean) {
  if (collapsed) return false
  return branchActive || current
}

export function SidebarMenu({
  collapsed = false,
  onNavigateComplete,
  menus: projectedMenus,
}: { collapsed?: boolean; onNavigateComplete?: () => void; menus?: MenuItem[] } = {}) {
  const { pathname } = useLocation()
  const storedMenus = useRouteStore((state) => state.menus)
  const flat = useRouteStore((state) => state.flat)
  const menus = projectedMenus ?? storedMenus
  const currentRoute =
    flat[pathname] ?? Object.entries(flat).find(([pattern]) => matchPath({ path: pattern, end: true }, pathname))?.[1]
  return (
    <SidebarMenuProvider
      collapsed={collapsed}
      menus={menus}
      currentRoute={currentRoute}
      onNavigateComplete={onNavigateComplete}
    >
      <SidebarMenuContent menus={menus} />
    </SidebarMenuProvider>
  )
}
