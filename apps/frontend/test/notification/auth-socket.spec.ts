import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
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

vi.mock("vue-router", () => ({ useRoute: () => ({ meta: { constant: true } }) }))
vi.mock("@rapidkit/hooks", () => ({ useLoading: () => ({ loading: false, startLoading: vi.fn(), endLoading: vi.fn() }) }))
vi.mock("@rapidkit/utils", () => ({ rsaEncrypt: vi.fn(async () => "encrypted") }))
vi.mock("@/service/api", () => ({
  fetchGetPublicKey: mocks.fetchGetPublicKey,
  fetchGetUserInfo: mocks.fetchGetUserInfo,
  fetchLogin: mocks.fetchLogin,
}))
vi.mock("@/hooks/common/router", () => ({
  useRouterPush: () => ({ toLogin: vi.fn(), redirectFromLogin: vi.fn() }),
}))
vi.mock("@/utils/storage", () => ({
  localStg: { get: vi.fn(() => "user-1"), set: vi.fn(), remove: vi.fn() },
}))
vi.mock("@/store/modules/route", () => ({ useRouteStore: () => ({ resetStore: mocks.resetRouteStore }) }))
vi.mock("@/store/modules/tab", () => ({
  useTabStore: () => ({ cacheTabs: mocks.cacheTabs, clearTabs: mocks.clearTabs }),
}))
vi.mock("@/store/modules/auth/shared", () => ({
  clearAuthStorage: mocks.clearAuthStorage,
  connectGlobalSocket: mocks.connectGlobalSocket,
  disconnectGlobalSocket: mocks.disconnectGlobalSocket,
  getToken: mocks.getToken,
}))
vi.mock("@/store/modules/notification/shared", () => ({
  connectNotificationSocket: mocks.connectNotificationSocket,
  disconnectNotificationSocket: mocks.disconnectNotificationSocket,
}))

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
    vi.stubGlobal("window", { $notification: undefined })
    setActivePinia(createPinia())
    vi.clearAllMocks()
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

    expect(mocks.connectNotificationSocket).toHaveBeenCalledWith("login-token")
  })

  it("connects the notification socket after restoring a stored login", async () => {
    const store = useAuthStore()

    await store.initUserInfo()

    expect(mocks.connectNotificationSocket).toHaveBeenCalledWith("stored-token")
  })

  it("disconnects the notification socket when auth state resets", async () => {
    const store = useAuthStore()
    Object.defineProperty(store, "$reset", { value: vi.fn() })

    await store.resetStore()

    expect(mocks.disconnectNotificationSocket).toHaveBeenCalledOnce()
  })
})
