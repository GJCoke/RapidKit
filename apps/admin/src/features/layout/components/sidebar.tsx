import { cn } from "@rapidkit/ui/lib/utils"
import { useAppStore } from "@/stores/app"
import { SidebarMenu } from "./sidebar-menu"

export function Sidebar() {
  const collapsed = useAppStore((state) => state.siderCollapse)

  return (
    <aside
      className="fixed left-0 top-0 z-20 flex h-full flex-col border-r border-sidebar-border bg-sidebar shadow-sidebar transition-[width] duration-300"
      style={{ width: collapsed ? "var(--sidebar-width-collapsed)" : "var(--sidebar-width)" }}
    >
      <div className="flex h-14 shrink-0 items-center justify-center border-b border-sidebar-border px-4">
        <span className={cn("text-lg font-bold text-sidebar-foreground", collapsed && "hidden")}>RapidKit</span>
        {collapsed && <span className="text-lg font-bold text-sidebar-foreground">R</span>}
      </div>
      <SidebarMenu />
    </aside>
  )
}
