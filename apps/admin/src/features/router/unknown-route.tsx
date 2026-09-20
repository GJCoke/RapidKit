import { Navigate, useLocation } from "react-router"
import { useTranslation } from "react-i18next"
import { ErrorState, LoadingState } from "@/features/layout/components/states"
import { useRouteExistence } from "@/services/hooks/use-route-existence"
import { useAuthStore } from "@/stores/auth"
import { pathToRouteName, resolveUnknownRouteState } from "./unknown-route-state"

export function UnknownRoute() {
  const { t } = useTranslation()
  const token = useAuthStore((state) => state.token)
  const location = useLocation()
  const routeName = pathToRouteName(location.pathname)
  const query = useRouteExistence(routeName, Boolean(token))
  const hasError = query.isError || Boolean(query.data?.error)
  const state = resolveUnknownRouteState({
    token,
    routeName,
    isLoading: query.isLoading,
    hasError,
    exists: query.data?.data ?? undefined,
  })

  if (state === "login") return <Navigate to="/login" state={{ from: location }} replace />
  if (state === "loading") return <LoadingState label={t("state.loading")} />
  if (state === "error") {
    return <ErrorState message={t("state.error")} onRetry={() => void query.refetch()} />
  }
  if (state === "forbidden") return <Navigate to="/403" replace />
  return <Navigate to="/404" replace />
}
