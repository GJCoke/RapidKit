import type { BackendRoute } from "@/services/api/route"
import { normalizeRoutes } from "@/features/router/route-model"

/** Self-service inbox access is authenticated, independent of backend menu grants. */
export function withNotificationRoutes(routes: BackendRoute[]): BackendRoute[] {
  const snapshot = normalizeRoutes(routes)
  if (snapshot.byName.notification_center || snapshot.byPath["/notification/center"]) return routes
  return [
    ...routes,
    {
      name: "notification_center",
      path: "/notification/center",
      component: "view.notification_center",
      meta: { title: "notification_center", i18nKey: "route.notification_center", hideInMenu: true, constant: false },
    },
  ]
}
