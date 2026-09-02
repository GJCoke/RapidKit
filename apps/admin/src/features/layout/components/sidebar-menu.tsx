import { createContext, useContext, useEffect, useState } from "react"
import { useLocation, useNavigate } from "react-router"
import { ChevronDown } from "lucide-react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@rapidkit/ui/components/collapsible"
import { Popover, PopoverContent, PopoverTrigger } from "@rapidkit/ui/components/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@rapidkit/ui/components/tooltip"
import { cn } from "@rapidkit/ui/lib/utils"
import { useAppStore } from "@/stores/app"
import { useRouteStore, type MenuItem } from "@/stores/route"
import { resolveIcon } from "./icon-map"

const MenuFlyoutContext = createContext(false)

export function isActive(item: MenuItem, pathname: string): boolean {
  if (item.path === pathname) return true
  return item.children?.some((child) => isActive(child, pathname)) ?? false
}

function useCollapsedMenu() {
  const collapsed = useAppStore((state) => state.siderCollapse)
  const inFlyout = useContext(MenuFlyoutContext)
  return collapsed && !inFlyout
}

function MenuLeaf({ item, depth }: { item: MenuItem; depth: number }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const collapsed = useCollapsedMenu()
  const Icon = resolveIcon(item.icon)
  const active = item.path === pathname
  const button = (
    <button
      type="button"
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? item.title : undefined}
      onClick={() => navigate(item.path)}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
        active
          ? "bg-sidebar-primary text-sidebar-primary-foreground"
          : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        collapsed && "justify-center px-0",
      )}
      style={collapsed ? undefined : { paddingLeft: `${depth * 12 + 12}px` }}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      {!collapsed && <span className="truncate">{item.title}</span>}
    </button>
  )

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="right">{item.title}</TooltipContent>
      </Tooltip>
    )
  }

  return button
}

function MenuGroup({ item, depth }: { item: MenuItem; depth: number }) {
  const { pathname } = useLocation()
  const collapsed = useCollapsedMenu()
  const branchActive = isActive(item, pathname)
  const [expanded, setExpanded] = useState(branchActive)
  const Icon = resolveIcon(item.icon)
  const visibleChildren = item.children?.filter((child) => !child.hideInMenu) ?? []

  useEffect(() => {
    if (branchActive) setExpanded(true)
  }, [branchActive, pathname])

  if (collapsed) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={item.title}
            className={cn(
              "flex w-full items-center justify-center rounded-md py-2 text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
              branchActive && "bg-sidebar-accent text-sidebar-accent-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent side="right" align="start" className="w-56 p-2">
          <div className="px-3 pb-2 pt-1 text-xs font-semibold text-muted-foreground">{item.title}</div>
          <MenuFlyoutContext.Provider value>
            <div className="space-y-1">
              {visibleChildren.map((child) => (
                <MenuNode key={child.key} item={child} depth={0} />
              ))}
            </div>
          </MenuFlyoutContext.Provider>
        </PopoverContent>
      </Popover>
    )
  }

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <CollapsibleTrigger
        type="button"
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring [&[data-state=open]>svg:last-child]:rotate-180",
          branchActive && "bg-sidebar-accent text-sidebar-accent-foreground",
        )}
        style={{ paddingLeft: `${depth * 12 + 12}px` }}
      >
        <Icon className="size-4 shrink-0" aria-hidden="true" />
        <span className="flex-1 truncate text-left">{item.title}</span>
        <ChevronDown className="size-4 shrink-0 transition-transform" aria-hidden="true" />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1 space-y-1">
        {visibleChildren.map((child) => (
          <MenuNode key={child.key} item={child} depth={depth + 1} />
        ))}
      </CollapsibleContent>
    </Collapsible>
  )
}

function MenuNode({ item, depth }: { item: MenuItem; depth: number }) {
  if (item.children?.length) return <MenuGroup item={item} depth={depth} />
  return <MenuLeaf item={item} depth={depth} />
}

export function SidebarMenu() {
  const menus = useRouteStore((state) => state.menus)

  return (
    <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-2">
      {menus
        .filter((item) => !item.hideInMenu)
        .map((item) => (
          <MenuNode key={item.key} item={item} depth={0} />
        ))}
    </nav>
  )
}
