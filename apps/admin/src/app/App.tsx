import { Suspense, useEffect, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { createBrowserRouter, Navigate, RouterProvider } from "react-router"
import type { RouteObject } from "react-router"
import { Button } from "@rapidkit/ui/components/button"
import { useAuthStore } from "@/stores/auth"
import { useRouteStore } from "@/stores/route"
import { useTabStore } from "@/stores/tab"
import { useUserInfo } from "@/services/hooks/use-auth"
import { useUserRoutes } from "@/services/hooks/use-routes"
import { AuthGuard } from "@/features/auth"
import { AdminLayout } from "@/features/layout"
import { constantRoutes, generateRoutes } from "@/features/router"
import { resolveAuthorizedHomePath } from "@/features/router/generate-routes"
import { EMPTY_ROUTE_SNAPSHOT, normalizeRoutes } from "@/features/router/route-model"
import { RouteErrorBoundary } from "@/features/router/route-error-boundary"
import { withNotificationRoutes } from "@/features/notifications/notification-routes"
import { AppProviders } from "./providers"
import { AppLoading } from "./app-loading"
import { finishBootstrapLoading } from "./bootstrap-loading"
import { resolveRouteLoadState } from "./route-state"

function AppRouter() {
  const { t } = useTranslation()
  const { token } = useAuthStore()
  const replaceSnapshot = useRouteStore((state) => state.replaceSnapshot)
  const clearRoutes = useRouteStore((state) => state.clearRoutes)
  const syncAuthorizedRoutes = useTabStore((state) => state.syncAuthorizedRoutes)
  const { isLoading: isUserLoading } = useUserInfo()
  const { data: routeResponse, isLoading, isError, refetch } = useUserRoutes()
  const backendRoutes = routeResponse?.data?.routes
  const routeSnapshot = useMemo(
    () => (backendRoutes ? normalizeRoutes(withNotificationRoutes(backendRoutes)) : EMPTY_ROUTE_SNAPSHOT),
    [backendRoutes],
  )
  const routeLoadState = resolveRouteLoadState({
    token,
    isLoading,
    isError,
    response: routeResponse,
    location: window.location,
  })

  const router = useMemo(() => {
    if (routeLoadState.kind !== "ready") return null

    const dynamicChildren = generateRoutes(routeSnapshot.tree)
    const authorizedHome = routeResponse?.data
      ? resolveAuthorizedHomePath(routeSnapshot, routeResponse.data.home)
      : "/404"
    const authRoutes: RouteObject[] = [
      {
        path: "/",
        Component: AuthGuard,
        errorElement: <RouteErrorBoundary />,
        children: [
          {
            Component: AdminLayout,
            children: [{ index: true, element: <Navigate to={authorizedHome} replace /> }, ...dynamicChildren],
          },
        ],
      },
    ]

    return createBrowserRouter([...authRoutes, ...constantRoutes])
  }, [routeLoadState.kind, routeResponse?.data, routeSnapshot])

  useEffect(() => {
    if (!token) clearRoutes()
    else if (routeResponse?.data && !routeResponse.error) {
      replaceSnapshot(routeSnapshot, routeResponse.data.home)
      syncAuthorizedRoutes(routeSnapshot, routeResponse.data.home)
    }
  }, [
    clearRoutes,
    replaceSnapshot,
    routeResponse?.data,
    routeResponse?.error,
    routeSnapshot,
    syncAuthorizedRoutes,
    token,
  ])

  const isBootstrapReady = Boolean(router && (!token || !isUserLoading))

  useEffect(() => {
    if (!router || !isBootstrapReady) return

    const finishWhenInitialized = () => {
      if (router.state.initialized) finishBootstrapLoading()
    }

    finishWhenInitialized()
    return router.subscribe(finishWhenInitialized)
  }, [isBootstrapReady, router])

  useEffect(() => {
    if (routeLoadState.kind === "error") finishBootstrapLoading()
  }, [routeLoadState.kind])

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

    return <AppLoading />
  }

  if (token && isUserLoading) return <AppLoading />

  return (
    <Suspense fallback={null}>
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
