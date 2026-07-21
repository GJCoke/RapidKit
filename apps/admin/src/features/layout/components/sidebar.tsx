import { cn } from "@rapidkit/ui/lib/utils"
import { useAppStore } from "@/stores/app"

export function Sidebar() {
  const { siderCollapse } = useAppStore()
  const width = siderCollapse ? 64 : 220

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-20 flex h-full flex-col border-r border-border bg-sidebar transition-all duration-300",
      )}
      style={{ width: `${width}px` }}
    >
      {/* Logo */}
      <div className="flex h-14 items-center justify-center border-b border-border px-4">
        <span className={cn("text-lg font-bold text-sidebar-foreground", siderCollapse && "hidden")}>RapidKit</span>
        {siderCollapse && <span className="text-lg font-bold text-sidebar-foreground">R</span>}
      </div>

      {/* Menu placeholder — will be populated by dynamic routes */}
      <nav className="flex-1 overflow-y-auto py-2">{/* Menu items rendered from route store */}</nav>
    </aside>
  )
}
