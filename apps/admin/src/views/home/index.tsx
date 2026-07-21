import { useTranslation } from "react-i18next"

export default function HomePage() {
  const { t } = useTranslation()

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("system.title")}</h1>
      <p className="text-muted-foreground">Welcome to the admin dashboard.</p>
    </div>
  )
}
