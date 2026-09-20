import { describe, expect, it, vi } from "vitest"

const push = vi.fn()
const hasRoute = vi.fn((name: string) => name === "notification_center" || name === "home")

vi.mock("@/hooks/common/router", () => ({ useRouterPush: () => ({ routerPushByKey: push }) }))
vi.mock("@/router", () => ({ router: { hasRoute: (name: string) => hasRoute(name) } }))

import { navigateToAction } from "@/utils/notification/action-nav"

describe("action-nav", () => {
  it("navigates to a registered named route with controlled params", async () => {
    const ok = await navigateToAction({ route: "notification_center", params: { id: "1" } })

    expect(ok).toBe(true)
    expect(push).toHaveBeenCalledWith("notification_center", { params: { id: "1" } })
  })

  it("rejects an unknown named route", async () => {
    expect(await navigateToAction({ route: "evil_route" })).toBe(false)
  })

  it("rejects a URL-like route", async () => {
    expect(await navigateToAction({ route: "https://example.com" })).toBe(false)
  })

  it("stringifies finite numeric params before navigating", async () => {
    const ok = await navigateToAction({ route: "notification_center", params: { page: 2 } })

    expect(ok).toBe(true)
    expect(push).toHaveBeenCalledWith("notification_center", { params: { page: "2" } })
  })

  it("rejects nested or otherwise unsafe params", async () => {
    expect(await navigateToAction({ route: "notification_center", params: { redirect: { to: "home" } } })).toBe(
      false,
    )
    expect(await navigateToAction({ route: "notification_center", params: { page: Number.POSITIVE_INFINITY } })).toBe(
      false,
    )
  })

  it("does nothing for a missing action", async () => {
    expect(await navigateToAction(null)).toBe(false)
  })
})
