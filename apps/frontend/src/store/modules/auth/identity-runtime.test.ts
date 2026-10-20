import { createPinia, setActivePinia } from "pinia"
import { beforeEach, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  storage: new Map<string, unknown>(),
  info: vi.fn(),
  routes: vi.fn(),
  create: vi.fn(),
  stop: vi.fn(),
  logout: vi.fn(),
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
vi.mock("socket.io-client", () => ({ io: () => ({ on: vi.fn(), disconnect: vi.fn(), io: { on: vi.fn() } }) }))
vi.mock("@/service/api", () => ({
  fetchLogout: state.logout,
  fetchGetUserInfo: state.info,
  fetchGetUserRoutes: state.routes,
  fetchCreateImpersonation: state.create,
  fetchDeleteCurrentImpersonation: state.stop,
  fetchGetCurrentImpersonation: vi.fn(),
  fetchLogin: vi.fn(),
  fetchGetPublicKey: vi.fn(),
}))
import { useAuthStore } from "./index"

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
  restrictedFields: {},
}

beforeEach(() => {
  vi.clearAllMocks()
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
  state.logout.mockResolvedValue({ data: true, error: null })
})

it("clears all identity runtime including fixed tabs without deleting credentials", async () => {
  const store = useAuthStore()
  store.token = "simulated"
  store.userInfo.id = "subject"
  state.storage.set("impersonatorToken", "original-admin")
  state.storage.set("globalTabs", [{ id: "fixed-admin-tab" }])
  await store.resetIdentityState()
  expect(store.token).toBe("")
  expect(store.userInfo.id).toBe("")
  expect(store.userInfo.isAdmin).toBe(false)
  expect(state.storage.get("token")).toBe("admin-token")
  expect(state.storage.get("impersonatorToken")).toBe("original-admin")
  expect(state.storage.has("globalTabs")).toBe(false)
  expect(state.tabReset).toHaveBeenCalledOnce()
  expect(state.notificationReset).toHaveBeenCalledOnce()
  expect(state.bannerReset).toHaveBeenCalledOnce()
  expect(state.login).not.toHaveBeenCalled()
})

it("ordinary logout removes every simulated credential backup", async () => {
  const store = useAuthStore()
  for (const key of ["impersonatorToken", "impersonatorRefreshToken", "impersonatorReturnPath", "impersonation"])
    state.storage.set(key, "backup")
  await store.resetStore()
  expect(state.storage.size).toBe(0)
  expect(state.login).toHaveBeenCalledOnce()
})

it("does not apply a late subject permission snapshot after administrator restoration", async () => {
  const store = useAuthStore()
  let finish!: (value: { data: typeof admin; error: null }) => void
  state.info.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const entering = store.startImpersonation({ targetUserId: "subject" })
  await vi.waitFor(() => expect(finish).toBeTypeOf("function"))
  await store.stopImpersonation()
  expect(store.userInfo.id).toBe("admin")
  finish({ data: { ...admin, id: "subject", isAdmin: false }, error: null })
  expect(await entering).toBe(false)
  expect(store.userInfo.id).toBe("admin")
  expect(state.connect).toHaveBeenCalledOnce()
  expect(state.connect).toHaveBeenCalledWith("admin-token")
})

it("explicit logout deduplicates requests and clears identity caches after the server responds", async () => {
  const store = useAuthStore()
  let finish!: (value: { data: boolean; error: null }) => void
  state.logout.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const first = store.logout()
  const second = store.logout()
  await vi.waitFor(() => expect(state.logout).toHaveBeenCalledOnce())
  expect(state.storage.get("token")).toBe("admin-token")
  finish({ data: true, error: null })
  await Promise.all([first, second])
  expect(state.storage.has("token")).toBe(false)
  expect(state.storage.has("refreshToken")).toBe(false)
  expect(state.notificationReset).toHaveBeenCalledOnce()
  expect(state.bannerReset).toHaveBeenCalledOnce()
  expect(state.tabReset).toHaveBeenCalledOnce()
  expect(state.login).toHaveBeenCalledOnce()
})

it.each(["error", "throw"])("logout still clears local identity when the server returns %s", async (mode) => {
  const store = useAuthStore()
  if (mode === "throw") state.logout.mockRejectedValueOnce(new Error("offline"))
  else state.logout.mockResolvedValueOnce({ data: null, error: new Error("offline") })
  await store.logout()
  expect(state.storage.has("token")).toBe(false)
  expect(state.login).toHaveBeenCalledOnce()
})

it("a late logout cannot clear a newly logged in identity", async () => {
  const store = useAuthStore()
  let finish!: (value: { data: boolean; error: null }) => void
  state.logout.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const pending = store.logout()
  await vi.waitFor(() => expect(state.logout).toHaveBeenCalledOnce())
  state.storage.set("token", "new-user-token")
  state.storage.set("refreshToken", "new-user-refresh")
  finish({ data: true, error: null })
  await pending
  expect(state.storage.get("token")).toBe("new-user-token")
  expect(state.login).not.toHaveBeenCalled()
})

it("passive identity reset does not send a logout request", async () => {
  await useAuthStore().resetStore()
  expect(state.logout).not.toHaveBeenCalled()
})

it("explicit logout rejects simulated identity without clearing its credentials", async () => {
  state.storage.set("impersonation", { sessionId: "simulation" })
  const store = useAuthStore()
  await store.logout()
  expect(state.logout).not.toHaveBeenCalled()
  expect(state.storage.get("token")).toBe("admin-token")
})

it("logout has a bounded wait and clears local credentials after timeout", async () => {
  vi.useFakeTimers()
  try {
    state.logout.mockImplementationOnce(() => new Promise(() => {}))
    const pending = useAuthStore().logout()
    await vi.advanceTimersByTimeAsync(5000)
    await pending
    expect(state.storage.has("token")).toBe(false)
    expect(state.logout.mock.calls[0][0].aborted).toBe(true)
    expect(state.login).toHaveBeenCalledOnce()
  } finally {
    vi.useRealTimers()
  }
})

it("logout with no credentials only clears local state", async () => {
  state.storage.delete("token")
  state.storage.delete("refreshToken")
  await useAuthStore().logout()
  expect(state.logout).not.toHaveBeenCalled()
  expect(state.login).toHaveBeenCalledOnce()
})

it("logout cannot redirect a new login while old route cleanup finishes", async () => {
  let finish!: () => void
  state.routeReset.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve
      }),
  )
  const pending = useAuthStore().logout()
  await vi.waitFor(() => expect(state.storage.has("token")).toBe(false))
  state.storage.set("token", "new-user-token")
  state.storage.set("refreshToken", "new-user-refresh")
  finish()
  await pending
  expect(state.storage.get("token")).toBe("new-user-token")
  expect(state.login).not.toHaveBeenCalled()
})
