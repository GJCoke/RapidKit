import type { ReactNode } from "react"
import { cn } from "@rapidkit/ui/lib/utils"
import { useAppStore } from "@/stores/app"
import type { MenuItem } from "@/stores/route"
import { SidebarMenu } from "./sidebar-menu"
import { SidebarBrand } from "./sidebar/sidebar-brand"

export function getSidebarClasses(collapsed: boolean, fixed = true): string {
  return cn(
    "left-0 top-0 z-20 flex h-full shrink-0 flex-col overflow-x-hidden border-r border-sidebar-border bg-sidebar shadow-sidebar transition-all duration-300 ease-in-out motion-reduce:transition-none",
    fixed ? "fixed" : "relative",
    collapsed ? "is-sidebar-collapsed" : "is-sidebar-expanded",
  )
}

export function Sidebar({
  menus,
  width,
  showBrand = true,
  fixed = true,
  children,
}: {
  menus?: MenuItem[]
  width?: number | string
  showBrand?: boolean
  fixed?: boolean
  children?: ReactNode
} = {}) {
  const collapsed = useAppStore((state) => state.siderCollapse)

  return (
    <aside
      data-sidebar-shell
      className={getSidebarClasses(collapsed, fixed)}
      style={{ width: width ?? (collapsed ? "var(--sidebar-width-collapsed)" : "var(--sidebar-width)") }}
    >
      {showBrand && <SidebarBrand collapsed={collapsed} className="border-sidebar-border px-4" />}
      <SidebarMenu collapsed={collapsed} menus={menus} />
      {children}
    </aside>
  )
}
