import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router"
import { PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { cn } from "@rapidkit/ui/lib/utils"
import { useEffectiveThemeConfig } from "@/features/theme"
import type { MenuItem } from "@/stores/route"
import { getMenuLabel } from "../menu-label"
import { navigateToMenuItem } from "../sidebar-menu"
import { getVisibleChildren } from "../sidebar/sidebar-menu-selection"
import { resolveMenuIcon } from "../sidebar/sidebar-icon"
import { findFirstNavigableDescendant } from "./menu-projection"

export function FirstLevelMenu({
  menus,
  activeKey,
  onSelect,
  collapsed = false,
  onToggleCollapsed,
}: {
  menus: MenuItem[]
  activeKey: string | null
  onSelect: (key: string) => MenuItem | null
  collapsed?: boolean
  onToggleCollapsed?: () => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const theme = useEffectiveThemeConfig()

  function activate(item: MenuItem) {
    const selected = onSelect(item.key)
    if (!selected) return
    const children = getVisibleChildren(selected)
    const target = children.length
      ? theme.sidebar.autoSelectFirstMenu
        ? findFirstNavigableDescendant(selected)
        : null
      : selected
    if (target) {
      navigateToMenuItem(target, {
        navigate,
        openExternal: (href, targetName, features) => window.open(href, targetName, features),
      })
    }
  }

  return (
    <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2" aria-label={t("layout.sectionNavigation")}>
      {menus.map((item) => {
        const Icon = resolveMenuIcon(item)
        const active = item.key === activeKey
        return (
          <button
            key={item.key}
            type="button"
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-14 flex-col items-center justify-center gap-1 rounded-md px-1 text-xs transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              active && "bg-sidebar-primary/10 text-sidebar-primary",
            )}
            onClick={() => activate(item)}
          >
            <Icon className="size-[18px] shrink-0" aria-hidden="true" />
            <span className={cn("w-full truncate text-center", collapsed && "sr-only")}>{getMenuLabel(item, t)}</span>
          </button>
        )
      })}
      {onToggleCollapsed && (
        <button
          type="button"
          aria-label={t("layout.toggleSidebar")}
          className="mt-auto flex h-9 shrink-0 items-center justify-center rounded-md text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          onClick={onToggleCollapsed}
        >
          {collapsed ? <PanelLeftOpen className="size-[18px]" /> : <PanelLeftClose className="size-[18px]" />}
        </button>
      )}
    </nav>
  )
}
