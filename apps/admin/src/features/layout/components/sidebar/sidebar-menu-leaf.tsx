import { useNavigate } from "react-router"
import { Tooltip, TooltipContent, TooltipTrigger } from "@rapidkit/ui/components/tooltip"
import { cn } from "@rapidkit/ui/lib/utils"
import type { MenuItem } from "@/stores/route"
import { getMenuLabel } from "../menu-label"
import { useTranslation } from "react-i18next"
import { resolveMenuIcon } from "./sidebar-icon"
import { useSidebarMenu } from "./sidebar-menu-provider"
import { openExternalRoute } from "@/features/router/external-route"
import {
  getMenuButtonClasses,
  getMenuIconClasses,
  getMenuIndentStyle,
  getMenuLabelClasses,
} from "./sidebar-menu-styles"

export function SidebarMenuLeaf({ item, depth }: { item: MenuItem; depth: number }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const menu = useSidebarMenu()
  const collapsed = menu.collapsed && !menu.inFlyout
  const active = menu.selectedKey === item.key
  const label = getMenuLabel(item, t)
  const Icon = resolveMenuIcon(item)
  const button = (
    <button
      type="button"
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? label : undefined}
      className={getMenuButtonClasses({ collapsed, active, branchActive: false })}
      style={getMenuIndentStyle(depth, collapsed)}
      onClick={() => {
        if (item.href) openExternalRoute(item.href)
        else navigate(item.path)
        menu.closeTransientSurface()
      }}
    >
      <Icon aria-hidden="true" className={getMenuIconClasses(collapsed)} />
      <span className={cn("truncate", getMenuLabelClasses(collapsed))}>{label}</span>
    </button>
  )

  return (
    <Tooltip disabled={!collapsed}>
      <TooltipTrigger render={button} />
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}
