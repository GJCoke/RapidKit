import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@rapidkit/ui/components/dropdown-menu"
import { cn } from "@rapidkit/ui/lib/utils"
import { useEffectiveThemeConfig } from "@/features/theme"
import type { MenuItem } from "@/stores/route"
import { getMenuLabel } from "../menu-label"
import { navigateToMenuItem } from "../sidebar-menu"
import { getVisibleChildren } from "../sidebar/sidebar-menu-selection"
import { resolveMenuIcon } from "../sidebar/sidebar-icon"
import { findFirstNavigableDescendant } from "./menu-projection"

function MenuContent({ item }: { item: MenuItem }) {
  const { t } = useTranslation()
  const Icon = item.icon || item.localIcon ? resolveMenuIcon(item) : null
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      {Icon && <Icon className="size-[18px] shrink-0" aria-hidden="true" />}
      {getMenuLabel(item, t)}
    </span>
  )
}

function NestedItem({ item, activate }: { item: MenuItem; activate: (item: MenuItem) => void }) {
  const children = getVisibleChildren(item)
  if (children.length) {
    return (
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <MenuContent item={item} />
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          {children.map((child) => (
            <NestedItem key={child.key} item={child} activate={activate} />
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    )
  }
  return (
    <DropdownMenuItem onClick={() => activate(item)}>
      <MenuContent item={item} />
    </DropdownMenuItem>
  )
}

export function HorizontalMenu({
  menus,
  selectedPath,
  onSelectBranch,
  branchBehavior = "dropdown",
}: {
  menus: MenuItem[]
  selectedPath: readonly string[]
  onSelectBranch?: (key: string) => MenuItem | null
  branchBehavior?: "dropdown" | "select"
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const theme = useEffectiveThemeConfig()
  const activate = (item: MenuItem) =>
    navigateToMenuItem(item, {
      navigate,
      openExternal: (href, target, features) => window.open(href, target, features),
    })
  const selectBranch = (item: MenuItem) => {
    const selected = onSelectBranch?.(item.key)
    if (selected && theme.sidebar.autoSelectFirstMenu) {
      const target = findFirstNavigableDescendant(selected)
      if (target) activate(target)
    }
  }

  return (
    <nav aria-label={t("layout.mainNavigation")} className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
      {menus.map((item) => {
        const children = getVisibleChildren(item)
        const active = selectedPath.includes(item.key)
        if (!children.length) {
          return (
            <button
              key={item.key}
              type="button"
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex h-9 shrink-0 items-center rounded-md px-3 text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
                active && "bg-primary/10 text-primary",
              )}
              onClick={() => activate(item)}
            >
              <MenuContent item={item} />
            </button>
          )
        }
        if (branchBehavior === "select") {
          return (
            <button
              key={item.key}
              type="button"
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex h-9 shrink-0 items-center rounded-md px-3 text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
                active && "bg-primary/10 text-primary",
              )}
              onClick={() => selectBranch(item)}
            >
              <MenuContent item={item} />
            </button>
          )
        }
        return (
          <DropdownMenu key={item.key}>
            <DropdownMenuTrigger
              className={cn(
                "inline-flex h-9 shrink-0 items-center gap-1 rounded-md px-3 text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
                active && "bg-primary/10 text-primary",
              )}
              onClick={() => selectBranch(item)}
            >
              <MenuContent item={item} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-auto min-w-40">
              {children.map((child) => (
                <NestedItem key={child.key} item={child} activate={activate} />
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      })}
    </nav>
  )
}
