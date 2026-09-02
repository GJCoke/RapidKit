import { createContext, useContext, useEffect, useRef, useState } from "react"
import { useLocation, useNavigate } from "react-router"
import { useTranslation } from "react-i18next"
import { ChevronDown } from "lucide-react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@rapidkit/ui/components/collapsible"
import { Popover, PopoverContent, PopoverTrigger } from "@rapidkit/ui/components/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@rapidkit/ui/components/tooltip"
import { cn } from "@rapidkit/ui/lib/utils"
import { useAppStore } from "@/stores/app"
import { useRouteStore, type MenuItem } from "@/stores/route"
import { resolveIcon } from "./icon-map"
import { getMenuLabel } from "./menu-label"

interface MenuFlyoutValue {
  inFlyout: boolean
  closeFlyout?: () => void
}

const MenuFlyoutContext = createContext<MenuFlyoutValue>({ inFlyout: false })
const SidebarCollapseContext = createContext<boolean | undefined>(undefined)

export function isActive(item: MenuItem, pathname: string): boolean {
  if (item.path === pathname) return true
  return item.children?.some((child) => isActive(child, pathname)) ?? false
}

export function navigateToMenuItem(navigate: (path: string) => void, path: string, closeFlyout?: () => void) {
  navigate(path)
  closeFlyout?.()
}

export function restoreMenuTriggerFocus(trigger: Pick<HTMLButtonElement, "focus"> | null) {
  trigger?.focus()
}

function useCollapsedMenu() {
  const storedCollapsed = useAppStore((state) => state.siderCollapse)
  const collapsedOverride = useContext(SidebarCollapseContext)
  const { inFlyout } = useContext(MenuFlyoutContext)
  const collapsed = collapsedOverride ?? storedCollapsed
  return collapsed && !inFlyout
}

function MenuLeaf({ item, depth }: { item: MenuItem; depth: number }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { closeFlyout } = useContext(MenuFlyoutContext)
  const collapsed = useCollapsedMenu()
  const Icon = resolveIcon(item.icon)
  const active = item.path === pathname
  const label = getMenuLabel(item, t)
  const button = (
    <button
      type="button"
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? label : undefined}
      onClick={() => navigateToMenuItem(navigate, item.path, closeFlyout)}
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
      {!collapsed && <span className="truncate">{label}</span>}
    </button>
  )

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    )
  }

  return button
}

function MenuGroup({ item, depth }: { item: MenuItem; depth: number }) {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const collapsed = useCollapsedMenu()
  const branchActive = isActive(item, pathname)
  const [expanded, setExpanded] = useState(branchActive)
  const [popoverOpen, setPopoverOpen] = useState(false)
  const popoverTriggerRef = useRef<HTMLButtonElement>(null)
  const Icon = resolveIcon(item.icon)
  const label = getMenuLabel(item, t)
  const visibleChildren = item.children?.filter((child) => !child.hideInMenu) ?? []

  useEffect(() => {
    if (branchActive) setExpanded(true)
  }, [branchActive, pathname])

  if (collapsed) {
    return (
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <button
            ref={popoverTriggerRef}
            type="button"
            aria-label={label}
            className={cn(
              "flex w-full items-center justify-center rounded-md py-2 text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
              branchActive && "bg-sidebar-accent text-sidebar-accent-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="right"
          align="start"
          className="w-56 p-2"
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            restoreMenuTriggerFocus(popoverTriggerRef.current)
          }}
        >
          <div className="px-3 pb-2 pt-1 text-xs font-semibold text-muted-foreground">{label}</div>
          <MenuFlyoutContext.Provider value={{ inFlyout: true, closeFlyout: () => setPopoverOpen(false) }}>
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
        <span className="flex-1 truncate text-left">{label}</span>
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

export function SidebarMenu({ collapsed }: { collapsed?: boolean } = {}) {
  const menus = useRouteStore((state) => state.menus)

  return (
    <SidebarCollapseContext.Provider value={collapsed}>
      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-2">
        {menus
          .filter((item) => !item.hideInMenu)
          .map((item) => (
            <MenuNode key={item.key} item={item} depth={0} />
          ))}
      </nav>
    </SidebarCollapseContext.Provider>
  )
}
