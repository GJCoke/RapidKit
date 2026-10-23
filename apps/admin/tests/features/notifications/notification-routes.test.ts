import { expect, test } from "vitest"
import { normalizeRoutes, findRouteForPath } from "@/features/router/route-model"
import { withNotificationRoutes } from "@/features/notifications/notification-routes"

test("authenticated inbox routes exist without backend menu entries and remain hidden from navigation", () => {
  const backend = [{ name: "home", path: "/home", component: "view.home" }]
  const result = normalizeRoutes(withNotificationRoutes(backend))
  expect(findRouteForPath(result, "/notification/center")).toMatchObject({
    name: "notification_center",
    component: "view.notification_center",
    hideInMenu: true,
    kind: "view",
  })
  expect(backend).toEqual([{ name: "home", path: "/home", component: "view.home" }])
  expect(withNotificationRoutes(withNotificationRoutes(backend))).toHaveLength(2)
})
