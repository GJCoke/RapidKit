import { useTranslation } from "react-i18next"
import { Card, CardContent, CardHeader, CardTitle } from "@rapidkit/ui/components/card"

export function RestrictedHome() {
  const { t } = useTranslation()

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>{t("home.welcome")}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{t("home.restricted")}</p>
      </CardContent>
    </Card>
  )
}
