import { useTranslation } from "react-i18next"
import { PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { Button } from "@rapidkit/ui/components/button"
import { useAppStore } from "@/stores/app"
import { Breadcrumbs } from "./breadcrumb/breadcrumbs"
import { MobileNav } from "./mobile-nav"
import { SidebarBrand } from "./sidebar/sidebar-brand"
import { HeaderTools } from "./header-tools"

export function getSidebarToggleIcon(collapsed: boolean): "collapse" | "expand" {
  return collapsed ? "expand" : "collapse"
}

export function Header({
  showLogo = false,
  showSidebarToggle = true,
  menu,
  showBreadcrumb = true,
}: {
  showLogo?: boolean
  showSidebarToggle?: boolean
  menu?: ReactNode
  showBreadcrumb?: boolean
} = {}) {
  const { t } = useTranslation()
  const { isMobile, siderCollapse, toggleSider } = useAppStore()
  const SidebarToggleIcon = getSidebarToggleIcon(siderCollapse) === "expand" ? PanelLeftOpen : PanelLeftClose

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-3 shadow-header">
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
        {isMobile ? (
          <MobileNav />
        ) : showSidebarToggle ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("layout.toggleSidebar")}
            onClick={toggleSider}
          >
            <SidebarToggleIcon key={String(siderCollapse)} className="size-4" aria-hidden="true" />
          </Button>
        ) : null}
        {!isMobile && showLogo && <SidebarBrand collapsed={false} className="w-44 justify-start px-1" />}
        {!isMobile && menu && <div className="flex min-w-0 flex-1">{menu}</div>}
        {!isMobile && showBreadcrumb && !menu && <Breadcrumbs />}
      </div>
      <HeaderTools isMobile={isMobile} />
    </header>
  )
}
import type { ReactNode } from "react"
