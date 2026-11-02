import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { useLocation, useNavigate, useRevalidator, useRouteError } from "react-router"
import { Button } from "@rapidkit/ui/components/button"
import { useRouteStore } from "@/stores/route"
import { resolveAuthorizedHomePath } from "./generate-routes"
import { shouldReloadChunk } from "./chunk-recovery"
import { captureBrowserError } from "@/observability"

const BUILD_ID = import.meta.env.VITE_SENTRY_RELEASE || import.meta.env.VITE_APP_VERSION || "development"

export function RouteErrorBoundary() {
  const error = useRouteError()
  const location = useLocation()
  const navigate = useNavigate()
  const revalidator = useRevalidator()
  const { t } = useTranslation()
  const snapshot = useRouteStore((state) => state.snapshot)
  const [errorId, setErrorId] = useState<string>()

  useEffect(() => {
    setErrorId(captureBrowserError(error, "route"))
    if (shouldReloadChunk(error, `${location.pathname}${location.search}`, BUILD_ID)) window.location.reload()
  }, [error, location.pathname, location.search])

  const home = resolveAuthorizedHomePath(snapshot, "")

  return (
    <div role="alert" className="flex min-h-64 flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-lg font-medium">{t("error.routeTitle")}</p>
      <p className="text-sm text-muted-foreground">{t("error.routeDescription")}</p>
      {errorId && <code className="select-all text-xs text-muted-foreground">{errorId}</code>}
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={() => revalidator.revalidate()}>
          {t("common.retry")}
        </Button>
        <Button type="button" onClick={() => navigate(home, { replace: true })}>
          {t("state.backHome")}
        </Button>
      </div>
    </div>
  )
}
