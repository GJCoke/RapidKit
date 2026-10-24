import type { BackendRoute } from "@/services/api/route"
import { normalizeRoutes } from "./route-model"

/** The source's public iframe route is available independently of backend menus. */
export function withBuiltinRoutes(routes: BackendRoute[]): BackendRoute[] {
  const snapshot = normalizeRoutes(routes)
  if (snapshot.byName["iframe-page"] || snapshot.byPath["/iframe-page/:url"]) return routes
  return [
    ...routes,
    {
      name: "iframe-page",
      path: "/iframe-page/:url",
      component: "view.iframe-page",
      meta: {
        title: "iframe-page",
        i18nKey: "route.iframe-page",
        constant: true,
        hideInMenu: true,
        keepAlive: true,
        multiTab: true,
        order: 10000,
      },
    },
  ]
}
