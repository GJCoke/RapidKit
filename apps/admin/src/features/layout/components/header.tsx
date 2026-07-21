import { useTranslation } from "react-i18next"
import { useAppStore } from "@/stores/app"
import { useAuthStore } from "@/stores/auth"

export function Header() {
  const { t } = useTranslation()
  const { toggleSider } = useAppStore()
  const { userInfo, clearAuth } = useAuthStore()

  const handleLogout = () => {
    clearAuth()
    window.location.href = "/login"
  }

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-background px-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent"
          onClick={toggleSider}
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>

      <div className="flex items-center gap-4">
        <span className="text-sm text-muted-foreground">{userInfo?.realName}</span>
        <button
          type="button"
          className="text-sm text-muted-foreground hover:text-foreground"
          onClick={handleLogout}
        >
          {t("auth.logout")}
        </button>
      </div>
    </header>
  )
}
