import type { RouteObject } from "react-router"
import { UnknownRoute } from "./unknown-route"
import { RouteErrorBoundary } from "./route-error-boundary"

export const LOGIN_PATH = "/login"
export const HOME_PATH = "/"

export const constantRoutes: RouteObject[] = [
  {
    path: "/login",
    errorElement: <RouteErrorBoundary />,
    lazy: async () => {
      const mod = await import("@/features/auth/components/login-page")
      return { Component: mod.default }
    },
  },
  {
    path: "/403",
    errorElement: <RouteErrorBoundary />,
    lazy: async () => {
      const mod = await import("@/shared/pages/403")
      return { Component: mod.default }
    },
  },
  {
    path: "/404",
    errorElement: <RouteErrorBoundary />,
    lazy: async () => {
      const mod = await import("@/shared/pages/404")
      return { Component: mod.default }
    },
  },
  {
    path: "/500",
    errorElement: <RouteErrorBoundary />,
    lazy: async () => {
      const mod = await import("@/shared/pages/500")
      return { Component: mod.default }
    },
  },
  {
    path: "*",
    errorElement: <RouteErrorBoundary />,
    element: <UnknownRoute />,
  },
]
