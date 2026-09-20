import type { CustomRoute, ElegantConstRoute, ElegantRoute } from "@elegant-router/types"
import { generatedRoutes } from "../elegant/routes"
import { layouts, views } from "../elegant/imports"
import { transformElegantRoutesToVueRoutes } from "../elegant/transform"

/**
 * custom routes
 *
 * @link https://github.com/soybeanjs/elegant-router?tab=readme-ov-file#custom-route
 */
const customRoutes: CustomRoute[] = []

/** create routes when the auth route mode is static */
export function createStaticRoutes() {
  const constantRoutes: ElegantRoute[] = []

  const authRoutes: ElegantRoute[] = []

  const routeList = generatedRoutes as unknown as ElegantRoute[]
  const notificationRoute = routeList.find((route) => route.name === "notification")
  const regularGeneratedRoutes = routeList.filter((route) => route.name !== "notification")
  const notificationChildren =
    notificationRoute && "children" in notificationRoute ? (notificationRoute.children ?? []) : []
  const userNotificationChildren = notificationChildren.filter(
    (route) => route.name === "notification_center" || route.name === "notification_preferences",
  )
  const manageNotificationRoute = notificationChildren.find((route) => route.name === "notification_manage")

  if (notificationRoute && userNotificationChildren.length > 0) {
    constantRoutes.push({
      ...notificationRoute,
      // Register these routes during bootstrap in dynamic mode, but keep them
      // authentication-protected. `meta.constant` means anonymous access to
      // the route guard, not merely "always registered".
      meta: {
        ...notificationRoute.meta,
        title: notificationRoute.meta?.title ?? "notification",
        constant: false,
        hideInMenu: true,
      },
      children: userNotificationChildren,
    } as ElegantRoute)
  }

  if (manageNotificationRoute) {
    authRoutes.push({
      ...manageNotificationRoute,
      // This subtree is promoted to an auth-route root. Elegant Router uses
      // underscores to infer nesting, so give the promoted root a first-level
      // name or its children would be flattened outside BaseLayout.
      name: "notificationManage",
      component: "layout.base",
      meta: { ...manageNotificationRoute.meta, order: 9 },
    } as ElegantRoute)
  }

  ;[...customRoutes, ...regularGeneratedRoutes].forEach((item) => {
    if (item.meta?.constant) {
      constantRoutes.push(item)
    } else {
      authRoutes.push(item)
    }
  })

  return {
    constantRoutes,
    authRoutes,
  }
}

/**
 * Get auth vue routes
 *
 * @param routes Elegant routes
 */
export function getAuthVueRoutes(routes: ElegantConstRoute[]) {
  return transformElegantRoutesToVueRoutes(routes, layouts, views)
}
