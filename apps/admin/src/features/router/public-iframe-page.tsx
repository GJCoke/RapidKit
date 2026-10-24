import { useEffect } from "react"
import { useNavigate } from "react-router"
import { useTranslation } from "react-i18next"
import { Button } from "@rapidkit/ui/components/button"
import { LocaleSwitch } from "@/features/locale/locale-switch"
import { ThemeToggle } from "@/features/layout/components/theme-toggle"
import { HOME_PATH } from "./constants"
import { IframePageRoute } from "./iframe-page-route"

export default function PublicIframePage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  useEffect(() => {
    document.title = `${t("route.iframe-page")} - ${t("system.title")}`
  }, [i18n.language, t])
  return (
    <div className="flex h-svh w-full flex-col bg-background">
      <header className="flex shrink-0 items-center justify-between border-b px-4 py-2">
        <Button variant="ghost" size="sm" onClick={() => navigate(HOME_PATH)}>
          {t("state.backHome")}
        </Button>
        <div className="flex items-center gap-1">
          <LocaleSwitch />
          <ThemeToggle />
        </div>
      </header>
      <main className="min-h-0 flex-1">
        <IframePageRoute />
      </main>
    </div>
  )
}
