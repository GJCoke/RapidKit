import type { BackendRoute } from "@/services/api/route"
import { normalizeRoutes } from "@/features/router/route-model"

/** Personal notification pages require login, independently of backend menu grants. */
export function withNotificationRoutes(routes: BackendRoute[]): BackendRoute[] {
  const snapshot = normalizeRoutes(routes)
  const personalRoutes = [
    { name: "notification_center", path: "/notification/center" },
    { name: "notification_preferences", path: "/notification/preferences" },
  ]
  const missing = personalRoutes.filter((route) => !snapshot.byName[route.name] && !snapshot.byPath[route.path])
  if (!missing.length) return routes
  return [
    ...routes,
    ...missing.map(({ name, path }) => ({
      name,
      path,
      component: `view.${name}`,
      meta: { title: name, i18nKey: `route.${name}`, hideInMenu: true, constant: false },
    })),
  ]
}
