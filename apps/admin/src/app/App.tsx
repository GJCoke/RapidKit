import { Suspense, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { createBrowserRouter, Navigate, RouterProvider } from "react-router"
import type { RouteObject } from "react-router"
import { Button } from "@rapidkit/ui/components/button"
import { useAuthStore } from "@/stores/auth"
import { useUserRoutes } from "@/services/hooks/use-routes"
import { AuthGuard } from "@/features/auth"
import { AdminLayout } from "@/features/layout"
import { constantRoutes, generateRoutes } from "@/features/router"
import { resolveAuthorizedHomePath } from "@/features/router/generate-routes"
import { AppProviders } from "./providers"
import { resolveRouteLoadState } from "./route-state"

function AppRouter() {
  const { t } = useTranslation()
  const { token } = useAuthStore()
  const { data: routeResponse, isLoading, isError, refetch } = useUserRoutes()
  const backendRoutes = routeResponse?.data?.routes
  const routeLoadState = resolveRouteLoadState({
    token,
    isLoading,
    isError,
    response: routeResponse,
    location: window.location,
  })

  const router = useMemo(() => {
    if (routeLoadState.kind !== "ready") return null

    const dynamicChildren = generateRoutes(backendRoutes ?? [])
    const authorizedHome = routeResponse?.data ? resolveAuthorizedHomePath(routeResponse.data) : "/404"
    const authRoutes: RouteObject[] = [
      {
        path: "/",
        Component: AuthGuard,
        children: [
          {
            Component: AdminLayout,
            children: [{ index: true, element: <Navigate to={authorizedHome} replace /> }, ...dynamicChildren],
          },
        ],
      },
    ]

    return createBrowserRouter([...authRoutes, ...constantRoutes])
  }, [backendRoutes, routeLoadState.kind, routeResponse?.data])

  const loadingFallback = (
    <div className="flex h-screen w-screen items-center justify-center">
      <div className="text-muted-foreground">{t("common.loading")}</div>
    </div>
  )

  if (!router) {
    if (routeLoadState.kind === "error") {
      return (
        <div className="flex h-screen w-screen items-center justify-center bg-background p-6">
          <div role="alert" className="flex max-w-sm flex-col items-center gap-3 text-center">
            <p className="text-sm text-muted-foreground">{t("common.failed")}</p>
            <Button type="button" variant="outline" onClick={() => void refetch()}>
              {t("common.retry")}
            </Button>
          </div>
        </div>
      )
    }

    return loadingFallback
  }

  return (
    <Suspense fallback={loadingFallback}>
      <RouterProvider router={router} />
    </Suspense>
  )
}

export default function App() {
  return (
    <AppProviders>
      <AppRouter />
    </AppProviders>
  )
}
