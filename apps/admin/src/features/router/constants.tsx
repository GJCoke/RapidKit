import type { RouteObject } from "react-router"
import { Navigate } from "react-router"

export const LOGIN_PATH = "/login"
export const HOME_PATH = "/home"

export const constantRoutes: RouteObject[] = [
  {
    path: "/login",
    lazy: async () => {
      const mod = await import("@/features/auth/components/login-page")
      return { Component: mod.default }
    },
  },
  {
    path: "/403",
    lazy: async () => {
      const mod = await import("@/shared/pages/403")
      return { Component: mod.default }
    },
  },
  {
    path: "/404",
    lazy: async () => {
      const mod = await import("@/shared/pages/404")
      return { Component: mod.default }
    },
  },
  {
    path: "/500",
    lazy: async () => {
      const mod = await import("@/shared/pages/500")
      return { Component: mod.default }
    },
  },
  {
    path: "*",
    element: <Navigate to="/404" replace />,
  },
]
