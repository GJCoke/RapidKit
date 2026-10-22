import { describe, expect, it, vi } from "vitest"

vi.mock("@/router/elegant/imports", () => ({ layouts: {}, views: {} }))
vi.mock("@/router/elegant/transform", () => ({ transformElegantRoutesToVueRoutes: vi.fn() }))

import { createStaticRoutes } from "@/router/routes"

interface RouteNode {
  name: string
  meta?: { constant?: boolean; hideInMenu?: boolean; order?: number }
  children?: RouteNode[]
}

function names(routes: readonly unknown[]): string[] {
  const nodes = routes as RouteNode[]
  return nodes.flatMap((route) => [route.name, ...names(route.children ?? [])])
}

describe("notification route classification", () => {
  it("registers user notification pages at bootstrap without granting anonymous access", () => {
    const { constantRoutes, authRoutes } = createStaticRoutes()
    const constantNames = names(constantRoutes)
    const authNames = names(authRoutes)
    const allNames = [...constantNames, ...authNames]

    expect(constantNames).toEqual(expect.arrayContaining(["notification_center", "notification_preferences"]))
    expect(authNames).toEqual(
      expect.arrayContaining([
        "notification_manage_templates",
        "notification_manage_announcements",
        "notification_manage_deliveries",
      ]),
    )
    expect(authNames).not.toContain("notification_center")
    expect(constantNames).not.toContain("notification_manage_templates")
    const notificationRoot = (constantRoutes as RouteNode[]).find((route) => route.name === "notification")
    expect(notificationRoot?.meta?.constant).toBe(false)
    expect(notificationRoot?.meta?.hideInMenu).toBe(true)
    const notificationManage = (authRoutes as RouteNode[]).find((route) => route.name === "notificationManage")
    expect(notificationManage?.name).not.toContain("_")
    expect(notificationManage?.meta?.order).toBe(9)
    expect(new Set(allNames).size).toBe(allNames.length)
  })
})
