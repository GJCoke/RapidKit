import { Pin, PinOff } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@rapidkit/ui/components/button"
import { cn } from "@rapidkit/ui/lib/utils"
import { useAppStore } from "@/stores/app"
import type { MenuItem } from "@/stores/route"
import { SidebarMenu } from "../sidebar-menu"
import { SidebarBrand } from "../sidebar/sidebar-brand"
import { FirstLevelMenu } from "./first-level-menu"

export function MixedSidebar({
  railMenus,
  childMenus,
  activeKey,
  onSelect,
  railWidth,
  childWidth,
  childPanelOpen,
  fixedPosition,
  showBrand,
  collapsed,
  onMouseLeave,
}: {
  railMenus: MenuItem[]
  childMenus: MenuItem[]
  activeKey: string | null
  onSelect: (key: string) => MenuItem | null
  railWidth: number
  childWidth: number
  childPanelOpen: boolean
  fixedPosition: boolean
  showBrand: boolean
  collapsed: boolean
  onMouseLeave: () => void
}) {
  const { t } = useTranslation()
  const { mixSiderFixed, toggleMixSiderFixed, toggleSider } = useAppStore()
  const panelVisible = childMenus.length > 0 && (childPanelOpen || mixSiderFixed)

  return (
    <aside
      data-sidebar-shell
      data-sidebar-kind="mixed"
      className={cn(
        "left-0 top-0 z-20 flex h-full shrink-0 bg-sidebar text-sidebar-foreground shadow-sidebar",
        fixedPosition ? "fixed" : "relative",
      )}
      style={{ width: railWidth + (mixSiderFixed && childMenus.length ? childWidth : 0) }}
      onMouseLeave={onMouseLeave}
    >
      <div
        className="relative z-10 flex h-full shrink-0 flex-col border-r border-sidebar-border bg-sidebar"
        style={{ width: railWidth }}
      >
        {showBrand && <SidebarBrand collapsed={true} />}
        <FirstLevelMenu
          menus={railMenus}
          activeKey={activeKey}
          onSelect={onSelect}
          collapsed={collapsed}
          onToggleCollapsed={toggleSider}
        />
      </div>
      {panelVisible && (
        <div
          data-mixed-child-panel
          className={cn(
            "z-0 flex h-full flex-col border-r border-sidebar-border bg-sidebar shadow-sidebar",
            !mixSiderFixed && "absolute left-full top-0",
          )}
          style={{ width: childWidth }}
        >
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-sidebar-border px-3">
            <span className="text-sm font-semibold">{t("theme.mixedSidebar.brand")}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t(mixSiderFixed ? "theme.mixedSidebar.unpinMenu" : "theme.mixedSidebar.pinMenu")}
              onClick={toggleMixSiderFixed}
            >
              {mixSiderFixed ? <PinOff className="size-4" /> : <Pin className="size-4" />}
            </Button>
          </div>
          <SidebarMenu collapsed={false} menus={childMenus} />
        </div>
      )}
    </aside>
  )
}
