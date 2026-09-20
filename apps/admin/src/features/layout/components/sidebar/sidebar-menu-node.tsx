import type { MenuItem } from "@/stores/route"
import { getVisibleChildren } from "./sidebar-menu-selection"
import { SidebarMenuGroup } from "./sidebar-menu-group"
import { SidebarMenuLeaf } from "./sidebar-menu-leaf"

export function SidebarMenuNode({ item, depth }: { item: MenuItem; depth: number }) {
  const children = getVisibleChildren(item)
  if (children.length) return <SidebarMenuGroup item={item} depth={depth} childrenItems={children} />
  return <SidebarMenuLeaf item={item} depth={depth} />
}
