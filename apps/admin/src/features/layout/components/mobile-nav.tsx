import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import { useLocation } from "react-router"
import { X } from "lucide-react"
import { Button } from "@rapidkit/ui/components/button"
import { Sheet, SheetClose, SheetContent, SheetTitle } from "@rapidkit/ui/components/sheet"
import { useAppStore } from "@/stores/app"
import { SidebarMenu } from "./sidebar-menu"

export function MobileNav() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const { mobileNavOpen, setMobileNavOpen } = useAppStore()

  useEffect(() => {
    setMobileNavOpen(false)
  }, [pathname, setMobileNavOpen])

  return (
    <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
      <SheetContent side="left" showCloseButton={false} className="w-72 gap-0 bg-sidebar p-0 text-sidebar-foreground">
        <SheetTitle className="sr-only">{t("layout.mobileNavigation")}</SheetTitle>
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-sidebar-border px-4">
          <span className="text-lg font-bold">RapidKit</span>
          <SheetClose asChild>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={t("layout.closeNavigation")}>
              <X className="size-4" aria-hidden="true" />
            </Button>
          </SheetClose>
        </div>
        <SidebarMenu collapsed={false} />
      </SheetContent>
    </Sheet>
  )
}
