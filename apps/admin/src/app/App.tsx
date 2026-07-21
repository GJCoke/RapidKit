import { Suspense, useMemo } from "react"
import { createBrowserRouter, Navigate, RouterProvider } from "react-router"
import type { RouteObject } from "react-router"
import { useAuthStore } from "@/stores/auth"
import { AuthGuard } from "@/features/auth"
import { AdminLayout } from "@/features/layout"
import { constantRoutes, HOME_PATH } from "@/features/router"
import { AppProviders } from "./providers"

function AppRouter() {
  const { token } = useAuthStore()

  const router = useMemo(() => {
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
            ],
          },
        ],
      },
    ]

    return createBrowserRouter([...authRoutes, ...constantRoutes])
  }, [token])

  return (
    <Suspense
      fallback={
        <div className="flex h-screen w-screen items-center justify-center">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      }
    >
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
