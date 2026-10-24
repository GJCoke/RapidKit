import { useEffect } from "react"
import { FileQuestion, ServerCrash, ShieldX } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router"
import { Button } from "@rapidkit/ui/components/button"
import { HOME_PATH } from "@/features/router/constants"

const illustrations = { "403": ShieldX, "404": FileQuestion, "500": ServerCrash }
export function ExceptionPage({ code }: { code: keyof typeof illustrations }) {
  const { t, i18n } = useTranslation()
  useEffect(() => {
    document.title = `${t(`route.${code}`)} - ${t("system.title")}`
  }, [code, i18n.language, t])
  const navigate = useNavigate()
  const Illustration = illustrations[code]
  return (
    <main className="flex h-full w-full flex-col items-center justify-center gap-5 bg-background px-6 py-10 text-center text-foreground">
      <Illustration aria-hidden="true" className="size-28 text-primary sm:size-36" strokeWidth={1.25} />
      <h1 className="text-7xl font-bold text-primary">{code}</h1>
      <p className="max-w-md text-sm text-muted-foreground">{t(`error.${code}`)}</p>
      <Button type="button" variant="outline" onClick={() => navigate(HOME_PATH)}>
        {t("state.backHome")}
      </Button>
    </main>
  )
}
