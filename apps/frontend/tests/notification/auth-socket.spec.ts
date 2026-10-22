import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  storage: new Map<string, unknown>(),
  fetchCreateImpersonation: vi.fn(),
  fetchGetCurrentImpersonation: vi.fn(),
  fetchDeleteCurrentImpersonation: vi.fn(),
  fetchGetUserRoutes: vi.fn(),
  fetchGetPublicKey: vi.fn(),
  fetchGetUserInfo: vi.fn(),
  fetchLogin: vi.fn(),
  connectNotificationSocket: vi.fn(),
  disconnectNotificationSocket: vi.fn(),
  connectGlobalSocket: vi.fn(),
  disconnectGlobalSocket: vi.fn(),
  clearAuthStorage: vi.fn(),
  getToken: vi.fn(),
  resetRouteStore: vi.fn(),
  cacheTabs: vi.fn(),
  clearTabs: vi.fn(),
}))

vi.mock("@/hooks/common/app-socket", () => ({ resetAppSockets: vi.fn() }))
vi.mock("vue-router", () => ({ useRoute: () => ({ meta: { constant: true } }) }))
vi.mock("@rapidkit/hooks", () => ({
  useLoading: () => ({ loading: false, startLoading: vi.fn(), endLoading: vi.fn() }),
}))
vi.mock("@rapidkit/utils", () => ({ rsaEncrypt: vi.fn(async () => "encrypted") }))
vi.mock("@/service/api", () => ({
  fetchCreateImpersonation: mocks.fetchCreateImpersonation,
  fetchGetCurrentImpersonation: mocks.fetchGetCurrentImpersonation,
  fetchDeleteCurrentImpersonation: mocks.fetchDeleteCurrentImpersonation,
  fetchGetUserRoutes: mocks.fetchGetUserRoutes,
  fetchGetPublicKey: mocks.fetchGetPublicKey,
  fetchGetUserInfo: mocks.fetchGetUserInfo,
  fetchLogin: mocks.fetchLogin,
}))
vi.mock("@/hooks/common/router", () => ({
  useRouterPush: () => ({ toLogin: vi.fn(), redirectFromLogin: vi.fn() }),
}))
vi.mock("@/utils/storage", () => ({
  localStg: {
    get: (key: string) => mocks.storage.get(key) ?? null,
    set: (key: string, value: unknown) => mocks.storage.set(key, value),
    remove: (key: string) => mocks.storage.delete(key),
  },
}))
vi.mock("@/store/modules/route", () => ({
  useRouteStore: () => ({
    resetStore: mocks.resetRouteStore,
    resolveAuthRoutes: (_roles: string[], routes: unknown) => routes ?? [],
    applyAuthRoutes: vi.fn(),
    removeInaccessibleTabs: vi.fn(),
    setIsInitAuthRoute: vi.fn(),
  }),
}))
vi.mock("@/store/modules/tab", () => ({
  useTabStore: () => ({
    cacheTabs: mocks.cacheTabs,
    clearTabs: mocks.clearTabs,
    $reset: vi.fn(),
    initHomeTab: vi.fn(),
  }),
}))
vi.mock("@/store/modules/auth/shared", () => ({
  clearAuthStorage: mocks.clearAuthStorage,
  connectGlobalSocket: mocks.connectGlobalSocket,
  disconnectGlobalSocket: mocks.disconnectGlobalSocket,
  getToken: mocks.getToken,
  setPermissionSignalHandler: vi.fn(),
}))
vi.mock("@/store/modules/notification/shared", () => ({
  connectNotificationSocket: mocks.connectNotificationSocket,
  disconnectNotificationSocket: mocks.disconnectNotificationSocket,
}))

vi.mock("@/store/modules/notification", () => ({ useNotificationStore: () => ({ reset: vi.fn() }) }))
vi.mock("@/store/modules/banner", () => ({ useBannerStore: () => ({ reset: vi.fn() }) }))
vi.mock("@/router", () => ({ router: { resolve: () => ({ name: "home" }), hasRoute: () => true, replace: vi.fn() } }))

import { useAuthStore } from "@/store/modules/auth"

const userInfo = {
  id: "user-1",
  createTime: "2026-09-05T00:00:00Z",
  updateTime: "2026-09-05T00:00:00Z",
  name: "User",
  email: "user@example.com",
  username: "user",
  isAdmin: false,
  roles: [],
  buttons: [],
}

describe("auth notification socket lifecycle", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "window",
      Object.assign(new EventTarget(), {
        $notification: undefined,
        location: { origin: "http://localhost", reload: vi.fn() },
        localStorage: {},
      }),
    )
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mocks.storage.clear()
    mocks.resetRouteStore.mockResolvedValue(undefined)
    mocks.fetchGetUserRoutes.mockResolvedValue({ data: { routes: [], home: "home" }, error: null })
    mocks.fetchGetPublicKey.mockResolvedValue({ data: "public-key", error: null })
    mocks.fetchLogin.mockResolvedValue({
      data: { accessToken: "login-token", refreshToken: "refresh-token" },
      error: null,
    })
    mocks.fetchGetUserInfo.mockResolvedValue({ data: userInfo, error: null })
    mocks.getToken.mockReturnValue("stored-token")
  })

  it("connects the notification socket after a successful login", async () => {
    const store = useAuthStore()

    await store.login("user", "password", false)

    expect(mocks.connectNotificationSocket).toHaveBeenCalledWith()
  })

  it("connects the notification socket after restoring a stored login", async () => {
    const store = useAuthStore()

    await store.initUserInfo()

    expect(mocks.connectNotificationSocket).toHaveBeenCalledWith()
  })

  it("disconnects the notification socket when auth state resets", async () => {
    const store = useAuthStore()
    Object.defineProperty(store, "$reset", { value: vi.fn() })

    await store.resetStore()

    expect(mocks.disconnectNotificationSocket).toHaveBeenCalledOnce()
  })
})
