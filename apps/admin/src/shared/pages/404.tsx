import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router"
import { Button } from "@rapidkit/ui/components/button"
import { HOME_PATH } from "@/features/router"

export default function NotFound() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-7xl font-bold text-primary">404</h1>
      <p className="text-sm text-muted-foreground">{t("error.404")}</p>
      <Button type="button" variant="outline" onClick={() => navigate(HOME_PATH)}>
        {t("state.backHome")}
      </Button>
    </div>
  )
}

export const Component = NotFound
