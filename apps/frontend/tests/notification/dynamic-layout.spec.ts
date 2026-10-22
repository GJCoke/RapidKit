import { describe, expect, it } from "vitest"
import type { RouteComponent } from "vue-router"

import { transformElegantRoutesToVueRoutes } from "@/router/elegant/transform"

describe("dynamic notification management layout", () => {
  it("keeps the database menu tree under the base layout", () => {
    const baseLayout = { name: "BaseLayout" } as RouteComponent
    const templatesView = { name: "TemplatesView" } as RouteComponent
    const routes = transformElegantRoutesToVueRoutes(
      [
        {
          name: "notificationManage",
          path: "/notification/manage",
          component: "layout.base",
          meta: { title: "notification_manage" },
          children: [
            {
              name: "notification_manage_templates",
              path: "/notification/manage/templates",
              component: "view.notification_manage_templates",
              meta: { title: "notification_manage_templates" },
            },
          ],
        },
      ] as never,
      { base: baseLayout },
      { notification_manage_templates: templatesView },
    )

    expect(routes).toHaveLength(1)
    expect(routes[0]?.component).toBe(baseLayout)
    expect(routes[0]?.children?.[0]?.component).toBe(templatesView)
  })
})
