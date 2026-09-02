import { Suspense, useMemo } from "react"
import { createBrowserRouter, Navigate, RouterProvider } from "react-router"
import type { RouteObject } from "react-router"
import { useAuthStore } from "@/stores/auth"
import { useUserRoutes } from "@/services/hooks/use-routes"
import { AuthGuard } from "@/features/auth"
import { AdminLayout } from "@/features/layout"
import { constantRoutes, generateRoutes, HOME_PATH } from "@/features/router"
import { AppProviders } from "./providers"

function AppRouter() {
  const { token } = useAuthStore()
  const { data: routeResponse, isLoading } = useUserRoutes()
  const backendRoutes = routeResponse?.data?.routes

  const router = useMemo(() => {
    if (token && isLoading) return null

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
  }, [token, isLoading, backendRoutes])

  const loadingFallback = (
    <div className="flex h-screen w-screen items-center justify-center">
      <div className="text-muted-foreground">Loading...</div>
    </div>
  )

  if (!router) return loadingFallback

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
