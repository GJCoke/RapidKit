import { createPinia, setActivePinia } from "pinia"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  storage: new Map<string, unknown>(),
  validate: vi.fn(),
  events: [] as string[],
  info: vi.fn(),
  routes: vi.fn(),
  create: vi.fn(),
  stop: vi.fn(),
  notificationReset: vi.fn(),
  bannerReset: vi.fn(),
  tabReset: vi.fn(),
  routeReset: vi.fn(),
  login: vi.fn(),
  home: vi.fn(),
  replace: vi.fn(),
  connect: vi.fn(),
}))
vi.mock("@/utils/storage", () => ({
  localStg: {
    get: (key: string) => state.storage.get(key) ?? null,
    set: (key: string, value: unknown) => state.storage.set(key, value),
    remove: (key: string) => state.storage.delete(key),
  },
}))
vi.mock("vue-router", () => ({
  useRoute: () => ({ meta: { constant: false }, name: "manage_user", fullPath: "/manage/user" }),
}))
vi.mock("@/router", () => ({
  router: { replace: state.replace, resolve: () => ({ name: "manage_user" }), hasRoute: () => true },
}))
vi.mock("@rapidkit/hooks", () => ({
  useLoading: () => ({ loading: false, startLoading: vi.fn(), endLoading: vi.fn() }),
}))
vi.mock("@/hooks/common/router", () => ({
  useRouterPush: () => ({ toLogin: state.login, toHome: state.home, redirectFromLogin: vi.fn() }),
}))
vi.mock("@/store/modules/route", () => ({
  useRouteStore: () => ({
    resetStore: state.routeReset,
    resolveAuthRoutes: (_roles: string[], routes: unknown) => routes,
    applyAuthRoutes: vi.fn(),
    removeInaccessibleTabs: vi.fn(),
    setIsInitAuthRoute: vi.fn(),
    hasAuthRoute: () => true,
  }),
}))
vi.mock("@/store/modules/tab", () => ({ useTabStore: () => ({ $reset: state.tabReset, initHomeTab: vi.fn() }) }))
vi.mock("@/store/modules/notification", () => ({ useNotificationStore: () => ({ reset: state.notificationReset }) }))
vi.mock("@/store/modules/banner", () => ({ useBannerStore: () => ({ reset: state.bannerReset }) }))
vi.mock("@/store/modules/notification/shared", () => ({
  connectNotificationSocket: state.connect,
  disconnectNotificationSocket: vi.fn(),
}))
vi.mock("@/hooks/common/app-socket", () => ({
  closeAppSocket: (socket: { disconnect(): void }) => socket.disconnect(),
  resetAppSockets: vi.fn(),
  openAppSocket: () => ({
    connected: false,
    on: vi.fn(),
    off: vi.fn(),
    disconnect: vi.fn(),
    io: { on: vi.fn(), off: vi.fn() },
  }),
}))
vi.mock("@/service/api", () => ({
  fetchGetUserInfo: state.info,
  fetchGetUserRoutes: state.routes,
  fetchCreateImpersonation: state.create,
  fetchDeleteCurrentImpersonation: state.stop,
  fetchGetCurrentImpersonation: state.validate,
  fetchLogin: vi.fn(),
  fetchGetPublicKey: vi.fn(),
}))
import { useAuthStore } from "@/store/modules/auth"

const created = {
  accessToken: "simulated",
  sessionId: "sid",
  subject: { id: "subject", name: "User", username: "user1" },
  expiresAt: "2099-01-01T00:00:00Z",
}
const admin = {
  id: "admin",
  createTime: "",
  updateTime: "",
  name: "Admin",
  username: "admin",
  email: "a@example.com",
  isAdmin: true,
  roles: [],
  buttons: [],
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv("VITE_AUTH_ROUTE_MODE", "dynamic")
  state.routeReset.mockResolvedValue(undefined)
  setActivePinia(createPinia())
  vi.stubGlobal(
    "window",
    Object.assign(new EventTarget(), { location: { origin: "http://localhost", reload: vi.fn() }, localStorage: {} }),
  )
  state.storage.clear()
  state.storage.set("token", "admin-token")
  state.storage.set("refreshToken", "admin-refresh")
  state.routes.mockResolvedValue({ data: { routes: [], home: "home" }, error: null })
  state.info.mockResolvedValue({ data: admin, error: null })
  state.create.mockResolvedValue({ data: created, error: null })
  state.stop.mockResolvedValue({ data: true, error: null })
})

let store: ReturnType<typeof useAuthStore> | undefined
beforeEach(() => {
  state.events.length = 0
  state.validate.mockImplementation(async () => {
    state.events.push("validate")
    const active = state.storage.get("impersonation") as Api.Impersonation.Snapshot
    return {
      data: { ...active, actor: { id: "admin", name: "Admin", username: "admin" }, createdAt: "2026-10-15T00:00:00Z" },
      error: null,
    }
  })
  state.info.mockImplementation(async () => {
    const token = state.storage.get("token")
    state.events.push(`info:${token}`)
    return { data: token === "simulated" ? { ...admin, id: "subject", isAdmin: false } : admin, error: null }
  })
  state.routes.mockImplementation(async () => {
    state.events.push(`routes:${state.storage.get("token")}`)
    return { data: { routes: [], home: "home" }, error: null }
  })
  state.stop.mockImplementation(async () => {
    state.events.push("stop")
    return { data: true, error: null }
  })
  state.connect.mockImplementation(() => state.events.push(`connect:${state.storage.get("token")}`))
})
afterEach(() => {
  store?.$dispose()
  store = undefined
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function active(expiresAt = created.expiresAt) {
  state.storage.set("impersonatorToken", "admin-token")
  state.storage.set("impersonatorRefreshToken", "admin-refresh")
  state.storage.set("impersonatorReturnPath", "/manage/user")
  state.storage.set("impersonation", { sessionId: created.sessionId, subject: created.subject, expiresAt })
  state.storage.set("token", "simulated")
  state.storage.delete("refreshToken")
}

it("validates before user, menu and socket bootstrap", async () => {
  active()
  store = useAuthStore()
  await store.initUserInfo()
  expect(state.events).toEqual(["validate", "info:simulated", "routes:simulated", "connect:simulated"])
  expect(store.userInfo.id).toBe("subject")
})

it("restores administrator on invalid bootstrap without loading subject", async () => {
  active()
  state.validate.mockImplementationOnce(async () => {
    state.events.push("validate")
    return { data: null, error: new Error("expired") }
  })
  store = useAuthStore()
  await store.initUserInfo()
  expect(state.events[0]).toBe("validate")
  expect(state.events).not.toContain("info:simulated")
  expect(store.userInfo.id).toBe("admin")
  expect(state.storage.get("token")).toBe("admin-token")
  expect(state.connect).toHaveBeenCalledOnce()
})

it("recovers an interrupted backup before any identity request", async () => {
  state.storage.set("impersonatorToken", "restored-admin")
  state.storage.set("impersonatorRefreshToken", "restored-refresh")
  state.storage.set("token", "simulated")
  store = useAuthStore()
  await store.initUserInfo()
  expect(state.validate).not.toHaveBeenCalled()
  expect(state.events[0]).toBe("info:restored-admin")
  expect(state.storage.get("refreshToken")).toBe("restored-refresh")
})

it("valid simulation without backup goes to login on stop", async () => {
  active()
  state.storage.delete("impersonatorToken")
  store = useAuthStore()
  await store.initUserInfo()
  expect(store.userInfo.id).toBe("subject")
  await store.stopImpersonation()
  expect(state.storage.has("token")).toBe(false)
  expect(state.login).toHaveBeenCalledOnce()
})

it("stops once at fixed expiry and keeps total minutes", async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-10-15T12:00:00Z"))
  active(new Date(Date.now() + 3600_000).toISOString())
  store = useAuthStore()
  await store.initUserInfo()
  expect(store.expiresInSeconds).toBe(3600)
  vi.setSystemTime(new Date(Date.now() + 3601_000))
  await vi.advanceTimersByTimeAsync(1000)
  expect(state.stop).toHaveBeenCalledOnce()
  expect(state.storage.get("token")).toBe("admin-token")
  await vi.advanceTimersByTimeAsync(5000)
  expect(state.stop).toHaveBeenCalledOnce()
})

it("checks elapsed expiry on focus even when interval was suspended", async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-10-15T12:00:00Z"))
  active(new Date(Date.now() + 1000).toISOString())
  store = useAuthStore()
  await store.initUserInfo()
  vi.setSystemTime(new Date(Date.now() + 2000))
  window.dispatchEvent(new Event("focus"))
  await vi.advanceTimersByTimeAsync(0)
  expect(state.stop).toHaveBeenCalledOnce()
  expect(state.storage.get("token")).toBe("admin-token")
})

it("cleans up expiry and focus listeners when the auth store is disposed", async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-10-15T12:00:00Z"))
  active(new Date(Date.now() + 1000).toISOString())
  store = useAuthStore()
  await store.initUserInfo()
  store.$dispose()
  vi.setSystemTime(new Date(Date.now() + 2000))
  window.dispatchEvent(new Event("focus"))
  await vi.advanceTimersByTimeAsync(1000)
  expect(state.stop).not.toHaveBeenCalled()
})

it("checks expiry when a hidden document becomes visible", async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-10-15T12:00:00Z"))
  const target = Object.assign(new EventTarget(), { visibilityState: "hidden" })
  vi.stubGlobal("document", target)
  active(new Date(Date.now() + 1000).toISOString())
  store = useAuthStore()
  await store.initUserInfo()
  vi.setSystemTime(new Date(Date.now() + 2000))
  target.dispatchEvent(new Event("visibilitychange"))
  await vi.advanceTimersByTimeAsync(0)
  expect(state.stop).not.toHaveBeenCalled()
  target.visibilityState = "visible"
  target.dispatchEvent(new Event("visibilitychange"))
  await vi.advanceTimersByTimeAsync(0)
  expect(state.stop).toHaveBeenCalledOnce()
})
