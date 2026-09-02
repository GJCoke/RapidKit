import { Suspense, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { createBrowserRouter, Navigate, RouterProvider } from "react-router"
import type { RouteObject } from "react-router"
import { Button } from "@rapidkit/ui/components/button"
import { useAuthStore } from "@/stores/auth"
import { useUserRoutes } from "@/services/hooks/use-routes"
import { AuthGuard } from "@/features/auth"
import { AdminLayout } from "@/features/layout"
import { constantRoutes, generateRoutes, HOME_PATH } from "@/features/router"
import { AppProviders } from "./providers"

function AppRouter() {
  const { t } = useTranslation()
  const { token } = useAuthStore()
  const { data: routeResponse, isLoading, isError, refetch } = useUserRoutes()
  const backendRoutes = routeResponse?.data?.routes

  const router = useMemo(() => {
    if (token && (isLoading || isError)) return null

    const homePath = HOME_PATH.replace(/^\/+|\/+$/g, "")
    const dynamicRoutes = backendRoutes?.filter((route) => route.path.replace(/^\/+|\/+$/g, "") !== homePath) ?? []
    const dynamicChildren = generateRoutes(dynamicRoutes)
    const authRoutes: RouteObject[] = [
      {
        path: "/",
        Component: AuthGuard,
        children: [
          {
            Component: AdminLayout,
            children: [
              { index: true, element: <Navigate to={HOME_PATH} replace /> },
              {
                path: "home",
                lazy: async () => {
                  const mod = await import("@/views/home/index")
                  return { Component: mod.default }
                },
              },
              ...dynamicChildren,
            ],
          },
        ],
      },
    ]

    return createBrowserRouter([...authRoutes, ...constantRoutes])
  }, [token, isLoading, isError, backendRoutes])

  const loadingFallback = (
    <div className="flex h-screen w-screen items-center justify-center">
      <div className="text-muted-foreground">{t("common.loading")}</div>
    </div>
  )

  if (!router) {
    if (isError) {
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
