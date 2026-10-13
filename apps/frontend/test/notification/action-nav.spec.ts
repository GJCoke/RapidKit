// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { router } from "@/router"
import { navigateToAction } from "@/utils/notification/action-nav"

vi.mock("@/router", async () => {
  const { createMemoryHistory, createRouter } = await import("vue-router")
  return {
    router: createRouter({
      history: createMemoryHistory(),
      routes: [
        { name: "home", path: "/", component: {} },
        { name: "notification_center", path: "/notifications", component: {} },
        { name: "manage_user-detail", path: "/manage/user-detail/:id", component: {} },
        { name: "manage_user-create", path: "/manage/user-detail/create", component: {} },
        { name: "login", path: "/login/:module(pwd-login|code-login|set-password)?", component: {} },
        { name: "403", path: "/403", component: {} },
      ],
    }),
  }
})
vi.mock("@/hooks/common/router", async () => {
  const { router } = await import("@/router")
  return {
    useRouterPush: () => ({ routerPushByKey: (name: string, options: object) => router.push({ name, ...options }) }),
  }
})
afterEach(() => vi.restoreAllMocks())

describe("action-nav", () => {
  it.each([
    { route: "login", path: "/login", params: {} },
    { route: "login", path: "/login/set-password", params: { module: "set-password" } },
    { route: "403", path: "/403", params: {} },
  ])("supports registered hidden system menu $route at $path", async (action) => {
    expect(await navigateToAction({ type: "menu", ...action })).toBe(true)
    expect(router.currentRoute.value.path).toBe(action.path)
  })

  it("opens a numeric system menu for editor validation", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null)
    expect(await navigateToAction({ type: "menu", route: "403", path: "/403" }, { newWindow: true })).toBe(true)
    expect(open).toHaveBeenCalledWith("/403", "_blank", "noopener,noreferrer")
    expect(await navigateToAction({ type: "menu", route: "404", path: "/404" })).toBe(false)
  })

  it("continues to navigate legacy registered named routes", async () => {
    expect(await navigateToAction({ route: "notification_center", params: {} })).toBe(true)
    expect(router.currentRoute.value.fullPath).toBe("/notifications")
  })

  it("uses a menu path snapshot and query without changing the target", async () => {
    expect(
      await navigateToAction({
        type: "menu",
        route: "manage_user-detail",
        path: "/manage/user-detail/user-17",
        params: { id: "user-17" },
        query: { tab: "profile" },
      }),
    ).toBe(true)
    expect(router.currentRoute.value.fullPath).toBe("/manage/user-detail/user-17?tab=profile")
  })

  it("rejects inaccessible menu routes and changed path snapshots", async () => {
    expect(await navigateToAction({ type: "menu", route: "private_page", path: "/private" })).toBe(false)
    expect(
      await navigateToAction({
        type: "menu",
        route: "manage_user-detail",
        path: "/old-user-path/17",
        params: { id: "17" },
      }),
    ).toBe(false)
    expect(
      await navigateToAction({
        type: "menu",
        route: "manage_user-detail",
        path: "https://example.com",
        params: { id: "17" },
      }),
    ).toBe(false)
  })

  it.each(["a:b", "a!b'c(d)*e$f&g;h,i=j[k]", "a/b", "中文 空格"])(
    "matches equivalent backend and router encodings for %s",
    async (id) => {
      const path = `/manage/user-detail/${encodeURIComponent(id).replace(/[!'()*]/g, (value) => `%${value.charCodeAt(0).toString(16).toUpperCase()}`)}`
      expect(await navigateToAction({ type: "menu", route: "manage_user-detail", path, params: { id } })).toBe(true)
      expect(router.currentRoute.value.params.id).toBe(id)
    },
  )

  it("keeps encoded slashes inside their segment and rejects malformed encodings", async () => {
    expect(
      await navigateToAction({
        type: "menu",
        route: "manage_user-detail",
        path: "/manage/user-detail/a/b",
        params: { id: "a/b" },
      }),
    ).toBe(false)
    expect(
      await navigateToAction({
        type: "menu",
        route: "manage_user-detail",
        path: "/manage/user-detail/%zz",
        params: { id: "%zz" },
      }),
    ).toBe(false)
  })

  it("keeps the selected menu when its path also matches a static route", async () => {
    expect(
      await navigateToAction({
        type: "menu",
        route: "manage_user-detail",
        path: "/manage/user-detail/create",
        params: { id: "create" },
      }),
    ).toBe(true)
    expect(router.currentRoute.value.name).toBe("manage_user-detail")
  })

  it("opens editor validation in a new tab without changing the current route", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null)
    const before = router.currentRoute.value.fullPath
    expect(
      await navigateToAction(
        {
          type: "menu",
          route: "manage_user-detail",
          path: "/manage/user-detail/17",
          params: { id: "17" },
          query: { tab: "profile" },
        },
        { newWindow: true },
      ),
    ).toBe(true)
    expect(open).toHaveBeenCalledWith("/manage/user-detail/17?tab=profile", "_blank", "noopener,noreferrer")
    expect(router.currentRoute.value.fullPath).toBe(before)
  })

  it("does not open a new tab if its URL would match a different menu", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null)
    expect(
      await navigateToAction(
        { type: "menu", route: "manage_user-detail", path: "/manage/user-detail/create", params: { id: "create" } },
        { newWindow: true },
      ),
    ).toBe(false)
    expect(open).not.toHaveBeenCalled()
  })

  it("opens an explicit HTTP link in an isolated new window", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null)
    expect(await navigateToAction({ type: "external", url: "https://example.com/help" })).toBe(true)
    expect(open).toHaveBeenCalledWith("https://example.com/help", "_blank", "noopener,noreferrer")
  })

  it.each([
    "javascript:alert(1)",
    "//example.com",
    "https://user:pass@example.com",
    "https://example.com\n/path",
    "data:text/html,test",
    "http://",
  ])("rejects unsafe external link %s", async (url) => {
    const open = vi.spyOn(window, "open").mockReturnValue(null)
    expect(await navigateToAction({ type: "external", url })).toBe(false)
    expect(open).not.toHaveBeenCalled()
  })

  it("stringifies finite numeric path params", async () => {
    expect(await navigateToAction({ route: "manage_user-detail", params: { id: 2 } })).toBe(true)
    expect(router.currentRoute.value.path).toBe("/manage/user-detail/2")
  })

  it("rejects malformed actions, unknown routes and unsafe params", async () => {
    expect(await navigateToAction(null)).toBe(false)
    expect(await navigateToAction({ route: "evil_route" })).toBe(false)
    expect(await navigateToAction({ route: "https://example.com" })).toBe(false)
    expect(await navigateToAction({ route: "notification_center", params: { redirect: { to: "home" } } })).toBe(false)
    expect(await navigateToAction({ route: "notification_center", params: { page: Infinity } })).toBe(false)
  })
})
