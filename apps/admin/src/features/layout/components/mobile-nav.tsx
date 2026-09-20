import { useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"
import { useLocation } from "react-router"
import { Menu, X } from "lucide-react"
import { Button } from "@rapidkit/ui/components/button"
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@rapidkit/ui/components/sheet"
import { useAppStore } from "@/stores/app"
import { SidebarMenu } from "./sidebar-menu"
import { SidebarBrand } from "./sidebar/sidebar-brand"

export function MobileNav() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const { mobileNavOpen, setMobileNavOpen } = useAppStore()
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    setMobileNavOpen(false)
  }, [pathname, setMobileNavOpen])

  return (
    <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
      <SheetTrigger
        render={
          <Button ref={triggerRef} type="button" variant="ghost" size="icon" aria-label={t("layout.openNavigation")} />
        }
      >
        <Menu className="size-4" aria-hidden="true" />
      </SheetTrigger>
      <SheetContent
        side="left"
        showCloseButton={false}
        className="w-72 gap-0 bg-sidebar p-0 text-sidebar-foreground"
        finalFocus={triggerRef}
      >
        <SheetTitle className="sr-only">{t("layout.mobileNavigation")}</SheetTitle>
        <div className="flex h-14 shrink-0 items-center justify-between border-sidebar-border pr-4">
          <SidebarBrand collapsed={false} className="justify-start px-4" />
          <SheetClose
            render={<Button type="button" variant="ghost" size="icon-sm" aria-label={t("layout.closeNavigation")} />}
          >
            <X className="size-4" aria-hidden="true" />
          </SheetClose>
        </div>
        <SidebarMenu collapsed={false} onNavigateComplete={() => setMobileNavOpen(false)} />
      </SheetContent>
    </Sheet>
  )
}
