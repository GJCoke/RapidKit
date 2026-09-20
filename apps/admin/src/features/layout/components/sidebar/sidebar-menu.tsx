import { ScrollArea } from "@rapidkit/ui/components/scroll-area"
import type { MenuItem } from "@/stores/route"
import { SidebarMenuNode } from "./sidebar-menu-node"

export function SidebarMenuContent({ menus }: { menus: MenuItem[] }) {
  return (
    <ScrollArea className="min-h-0 flex-1">
      <nav data-layout-scroll="sidebar" className="flex flex-col gap-1 px-2 py-2">
        {menus
          .filter((item) => !item.hideInMenu)
          .map((item) => (
            <SidebarMenuNode key={item.key} item={item} depth={0} />
          ))}
      </nav>
    </ScrollArea>
  )
}
