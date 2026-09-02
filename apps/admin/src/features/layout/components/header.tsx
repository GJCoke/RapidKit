import { useTranslation } from "react-i18next"
import { Menu } from "lucide-react"
import { Button } from "@rapidkit/ui/components/button"
import { useAppStore } from "@/stores/app"
import { Breadcrumbs } from "./breadcrumbs"
import { ThemeToggle } from "./theme-toggle"
import { UserMenu } from "./user-menu"

export function handleNavigationToggle(
  isMobile: boolean,
  setMobileNavOpen: (open: boolean) => void,
  toggleSider: () => void,
) {
  if (isMobile) setMobileNavOpen(true)
  else toggleSider()
}

export function Header() {
  const { t } = useTranslation()
  const { isMobile, toggleSider, setMobileNavOpen } = useAppStore()

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-3 shadow-header">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t(isMobile ? "layout.openNavigation" : "layout.toggleSidebar")}
          onClick={() => handleNavigationToggle(isMobile, setMobileNavOpen, toggleSider)}
        >
          <Menu className="size-4" aria-hidden="true" />
        </Button>
        {!isMobile && <Breadcrumbs />}
      </div>
      <div className="flex items-center gap-1">
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  )
}
