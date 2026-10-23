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
  expect(withNotificationRoutes(withNotificationRoutes(backend))).toHaveLength(3)
})

test("authenticated preference routes exist without backend menu grants and retain existing definitions", () => {
  const result = normalizeRoutes(withNotificationRoutes([]))
  expect(findRouteForPath(result, "/notification/preferences")).toMatchObject({
    name: "notification_preferences",
    component: "view.notification_preferences",
    hideInMenu: true,
    kind: "view",
  })
  const configured = [
    {
      name: "notification_preferences",
      path: "/notification/preferences",
      component: "view.notification_preferences",
      meta: { title: "Custom preference title" },
    },
  ]
  expect(withNotificationRoutes(configured).filter((route) => route.name === "notification_preferences")).toEqual(
    configured,
  )
})
