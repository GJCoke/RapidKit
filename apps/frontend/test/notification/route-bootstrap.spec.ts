import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  fetchGetConstantRoutes: vi.fn(),
  fetchGetUserRoutes: vi.fn(),
  initHomeTab: vi.fn(),
}))

vi.mock("@/router", async () => {
  const { createMemoryHistory, createRouter } = await import("vue-router")
  return { router: createRouter({ history: createMemoryHistory(), routes: [] }) }
})
vi.mock("@/router/elegant/imports", () => {
  const component = { render: () => null }
  return {
    layouts: { base: component, blank: component },
    views: new Proxy({}, { get: () => component }),
  }
})
vi.mock("@/service/api", () => ({
  fetchGetConstantRoutes: mocks.fetchGetConstantRoutes,
  fetchGetUserRoutes: mocks.fetchGetUserRoutes,
  fetchIsRouteExist: vi.fn(),
}))
vi.mock("@/store/modules/auth", () => ({
  useAuthStore: () => ({ userInfo: { id: "user-1", roles: [] }, isStaticSuper: false }),
}))
vi.mock("@/store/modules/tab", () => ({ useTabStore: () => ({ initHomeTab: mocks.initHomeTab }) }))
vi.mock("@/hooks/common/icon", () => ({ useSvgIcon: () => ({ SvgIconVNode: () => null }) }))
vi.mock("@/locales", () => ({ $t: (key: string) => key }))
vi.mock("@/utils/storage", () => ({ localStg: { get: () => null } }))

import { router } from "@/router"
import { createStaticRoutes } from "@/router/routes"
import { useRouteStore } from "@/store/modules/route"

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv("VITE_AUTH_ROUTE_MODE", "dynamic")
  setActivePinia(createPinia())
  for (const route of router.getRoutes()) {
    if (route.name) router.removeRoute(route.name)
  }
})

describe("hidden notification routes during dynamic bootstrap", () => {
  it.each([false, true])(
    "keeps the inbox navigable outside sidebar menus when the backend returns constants: %s",
    async (withBackendConstants) => {
      const { constantRoutes, authRoutes } = createStaticRoutes()
      const login = constantRoutes.find((route) => route.name === "login")!
      const home = authRoutes.find((route) => route.name === "home")!
      mocks.fetchGetConstantRoutes.mockResolvedValue({ data: withBackendConstants ? [login] : [], error: null })
      mocks.fetchGetUserRoutes.mockResolvedValue({ data: { routes: [home], home: "home" }, error: null })
      const store = useRouteStore()

      await store.initConstantRoute()
      expect(router.hasRoute("notification_center")).toBe(true)
      expect(router.hasRoute("notification_preferences")).toBe(true)
      expect(router.hasRoute("login")).toBe(true)

      await store.initAuthRoute()
      await router.push({ name: "notification_center" })
      expect(router.currentRoute.value.path).toBe("/notification/center")
      expect(router.currentRoute.value.matched.map((route) => route.name)).toEqual([
        "notification",
        "notification_center",
      ])
      expect(router.currentRoute.value.meta.constant).toBe(false)
      expect(router.currentRoute.value.meta.hideInMenu).toBe(true)
      expect(store.menus.map((menu) => menu.key)).toContain("home")
      expect(store.menus.map((menu) => menu.key)).not.toContain("notification")
      expect(router.getRoutes().filter((route) => route.name === "login")).toHaveLength(1)
    },
  )
})
