import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router"
import { ChevronDown } from "lucide-react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@rapidkit/ui/components/collapsible"
import { Popover, PopoverContent, PopoverTrigger } from "@rapidkit/ui/components/popover"
import { cn } from "@rapidkit/ui/lib/utils"
import { useEffectiveThemeConfig } from "@/features/theme"
import type { MenuItem } from "@/stores/route"
import { getMenuLabel } from "../menu-label"
import { findFirstNavigableDescendant } from "../menu/menu-projection"
import { resolveMenuIcon } from "./sidebar-icon"
import { SidebarMenuNode } from "./sidebar-menu-node"
import { SidebarMenuProvider, useSidebarMenu } from "./sidebar-menu-provider"
import {
  getMenuButtonClasses,
  getMenuChevronClasses,
  getMenuIconClasses,
  getMenuIndentStyle,
  getMenuLabelClasses,
  getSubmenuPanelClasses,
} from "./sidebar-menu-styles"

export function SidebarMenuGroup({
  item,
  depth,
  childrenItems,
}: {
  item: MenuItem
  depth: number
  childrenItems: MenuItem[]
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const theme = useEffectiveThemeConfig()
  const menu = useSidebarMenu()
  const collapsed = menu.collapsed && !menu.inFlyout
  const expanded = menu.isExpanded(item.key)
  const branchActive = menu.selectedPath.includes(item.key)
  const [popoverOpen, setPopoverOpen] = useState(false)
  const popoverTriggerRef = useRef<HTMLButtonElement>(null)
  const label = getMenuLabel(item, t)
  const Icon = resolveMenuIcon(item)

  const autoSelectFirstMenu = () => {
    if (!theme.sidebar.autoSelectFirstMenu) return
    const target = findFirstNavigableDescendant(item)
    if (!target) return
    if (target.href) window.open(target.href, "_blank", "noopener,noreferrer")
    else navigate(target.path)
    menu.closeTransientSurface()
  }

  const trigger = (
    <CollapsibleTrigger
      ref={popoverTriggerRef}
      type="button"
      aria-label={collapsed ? label : undefined}
      className={getMenuButtonClasses({ collapsed, active: false, branchActive })}
      data-branch-active={branchActive || undefined}
      style={getMenuIndentStyle(depth, collapsed)}
      onClick={autoSelectFirstMenu}
    >
      <Icon aria-hidden="true" className={getMenuIconClasses(collapsed)} />
      <span className={cn("flex-1 truncate text-left", getMenuLabelClasses(collapsed))}>{label}</span>
      <ChevronDown aria-hidden="true" className={getMenuChevronClasses(expanded, collapsed)} />
    </CollapsibleTrigger>
  )

  return (
    <Popover open={collapsed && popoverOpen} onOpenChange={(open) => setPopoverOpen(collapsed && open)}>
      <Collapsible
        open={!collapsed && expanded}
        onOpenChange={(open) => !collapsed && menu.setGroupExpanded(item.key, open)}
      >
        <PopoverTrigger render={trigger} />
        <CollapsibleContent keepMounted className={getSubmenuPanelClasses()}>
          <div className="min-h-0 space-y-1 overflow-hidden pt-1">
            {childrenItems.map((child) => (
              <SidebarMenuNode key={child.key} item={child} depth={depth + 1} />
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
      <PopoverContent side="right" align="start" className="w-56 p-2" finalFocus={popoverTriggerRef}>
        <div className="px-3 pb-2 pt-1 text-xs font-semibold text-muted-foreground">{label}</div>
        <SidebarMenuProvider
          collapsed={false}
          menus={childrenItems}
          inFlyout
          onNavigateComplete={() => {
            setPopoverOpen(false)
            menu.closeTransientSurface()
          }}
        >
          <div className="space-y-1">
            {childrenItems.map((child) => (
              <SidebarMenuNode key={child.key} item={child} depth={0} />
            ))}
          </div>
        </SidebarMenuProvider>
      </PopoverContent>
    </Popover>
  )
}
