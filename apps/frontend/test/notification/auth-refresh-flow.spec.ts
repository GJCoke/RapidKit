import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  adapter: vi.fn(),
  storage: new Map<string, string>(),
  resetStore: vi.fn(),
  syncAccessToken: vi.fn(),
}))
vi.mock("@rapidkit/utils", () => ({ nanoid: () => String(Math.random()) }))
vi.mock("@rapidkit/axios", async () => {
  const actual = await import("../../../../packages/axios/src/index")
  return {
    ...actual,
    createFlatRequest: (config: any, options: any) =>
      actual.createFlatRequest({ ...config, adapter: mocks.adapter }, options),
  }
})
vi.mock("@/utils/storage", () => ({
  localStg: {
    get: (key: string) => mocks.storage.get(key),
    set: (key: string, value: string) => mocks.storage.set(key, value),
  },
}))
vi.mock("@/store/modules/auth", () => ({ useAuthStore: () => mocks }))
vi.mock("@/utils/service", () => ({ getServiceBaseURL: () => ({ baseURL: "/api/v1", otherBaseURL: {} }) }))
vi.mock("@/locales", () => ({ $t: (key: string) => key }))

import { request } from "@/service/request"
import { fetchLogout } from "@/service/api/auth"
import { getAuthSession, setLogoutSession } from "@/service/request/auth-session"

describe("auth refresh request flow", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setLogoutSession(null)
    vi.stubEnv("VITE_SERVICE_SUCCESS_CODE", "0")
    vi.stubEnv("VITE_SERVICE_EXPIRED_TOKEN_CODES", "14002")
    vi.stubEnv("VITE_SERVICE_LOGOUT_CODES", "14003,14008")
    mocks.storage.clear()
    mocks.storage.set("token", "old-access")
    mocks.storage.set("refreshToken", "old-refresh")
    mocks.resetStore.mockImplementation(() => mocks.storage.clear())
    request.state.refreshTokenPromise = null
  })

  it("uses the backend refresh header and rotates once for concurrent expired requests", async () => {
    let refreshCount = 0
    mocks.adapter.mockImplementation(async (config) => {
      let data
      if (config.url === "/auth/token/refresh") {
        refreshCount++
        expect(config.headers.get("X-Refresh-Token")).toBe("old-refresh")
        expect(config.headers.get("Authorization")).toBeUndefined()
        data = { code: 0, data: { accessToken: "new-access", refreshToken: "new-refresh" } }
      } else {
        data =
          config.headers.get("Authorization") === "Bearer new-access"
            ? { code: 0, data: "allowed" }
            : { code: 14002, data: null }
      }
      return { status: 200, statusText: "OK", headers: {}, config, data }
    })
    const results = await Promise.all([request({ url: "/protected" }), request({ url: "/protected" })])
    expect(results.map((r) => r.data)).toEqual(["allowed", "allowed"])
    expect(refreshCount).toBe(1)
    expect(mocks.storage.get("refreshToken")).toBe("new-refresh")
    expect(mocks.syncAccessToken).toHaveBeenCalledWith("new-access")
  })

  it("returns a failed result when the refresh token is also expired", async () => {
    mocks.adapter.mockImplementation(async (config) => ({
      status: 200,
      statusText: "OK",
      headers: {},
      config,
      data: { code: 14002, data: null },
    }))
    const result = await request({ url: "/protected" })
    expect(result.error).not.toBeNull()
    expect(mocks.adapter).toHaveBeenCalledTimes(2)
    expect(mocks.resetStore).toHaveBeenCalledTimes(1)
  })

  it("stops after one retry when the refreshed access token is rejected", async () => {
    mocks.adapter.mockImplementation(async (config) => ({
      status: 200,
      statusText: "OK",
      headers: {},
      config,
      data:
        config.url === "/auth/token/refresh"
          ? { code: 0, data: { accessToken: "new-access", refreshToken: "new-refresh" } }
          : { code: 14002, data: null },
    }))
    const result = await request({ url: "/protected" })
    expect(result.error).not.toBeNull()
    expect(mocks.adapter).toHaveBeenCalledTimes(3)
    expect(mocks.resetStore).toHaveBeenCalledTimes(1)
  })
  it("reuses rotated credentials for an old response arriving after refresh completes", async () => {
    let releaseLate: () => void = () => {}
    const late = new Promise<void>((resolve) => {
      releaseLate = resolve
    })
    let refreshCount = 0
    mocks.adapter.mockImplementation(async (config) => {
      let data
      if (config.url === "/auth/token/refresh") {
        refreshCount++
        data = { code: 0, data: { accessToken: "new-access", refreshToken: "new-refresh" } }
      } else if (config.headers.get("Authorization") === "Bearer new-access") {
        data = { code: 0, data: "allowed" }
      } else {
        if (config.url === "/late") await late
        data = { code: 14002, data: null }
      }
      return { status: 200, statusText: "OK", headers: {}, config, data }
    })
    const lateResult = request({ url: "/late" })
    expect((await request({ url: "/protected" })).data).toBe("allowed")
    releaseLate()
    expect((await lateResult).data).toBe("allowed")
    expect(refreshCount).toBe(1)
  })
  it("does not replay an expired request under a different login", async () => {
    let calls = 0
    mocks.adapter.mockImplementation(async (config) => {
      calls++
      mocks.storage.set("token", "other-access")
      mocks.storage.set("refreshToken", "other-refresh")
      return { status: 200, statusText: "OK", headers: {}, config, data: { code: 14002, data: null } }
    })
    expect((await request({ url: "/mutation", method: "post" })).error).not.toBeNull()
    expect(calls).toBe(1)
    expect(mocks.storage.get("token")).toBe("other-access")
    expect(mocks.resetStore).not.toHaveBeenCalled()
  })

  it("a new login does not wait for the old login's pending refresh", async () => {
    let releaseOld: () => void = () => {}
    const oldRefresh = new Promise<void>((resolve) => {
      releaseOld = resolve
    })
    let signalStarted: () => void = () => {}
    const started = new Promise<void>((resolve) => {
      signalStarted = resolve
    })
    mocks.adapter.mockImplementation(async (config) => {
      let data
      if (config.url === "/auth/token/refresh") {
        if (config.headers.get("X-Refresh-Token") === "old-refresh") {
          signalStarted()
          await oldRefresh
          data = { code: 0, data: { accessToken: "old-rotated", refreshToken: "old-rotated-refresh" } }
        } else {
          data = { code: 0, data: { accessToken: "other-rotated", refreshToken: "other-rotated-refresh" } }
        }
      } else {
        data =
          config.headers.get("Authorization") === "Bearer other-rotated"
            ? { code: 0, data: "allowed" }
            : { code: 14002, data: null }
      }
      return { status: 200, statusText: "OK", headers: {}, config, data }
    })
    const oldResult = request({ url: "/old" })
    await started
    mocks.storage.set("token", "other-access")
    mocks.storage.set("refreshToken", "other-refresh")
    const newResult = request({ url: "/new" })
    // Release on the next event loop turn: the new session must rotate independently.
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    const rotatedBeforeOldCompletes = mocks.storage.get("token")
    releaseOld()
    const [old, current] = await Promise.all([oldResult, newResult])
    expect(rotatedBeforeOldCompletes).toBe("other-rotated")
    expect(old.error).not.toBeNull()
    expect(current.data).toBe("allowed")
    expect(mocks.storage.get("token")).toBe("other-rotated")
  })
})

it("logout can recover its own expired access while other requests cannot start refresh", async () => {
  mocks.storage.clear()
  mocks.storage.set("token", "old-access")
  mocks.storage.set("refreshToken", "old-refresh")
  vi.stubEnv("VITE_SERVICE_SUCCESS_CODE", "0")
  vi.stubEnv("VITE_SERVICE_EXPIRED_TOKEN_CODES", "14002")
  const session = getAuthSession()
  setLogoutSession(session)
  const calls: string[] = []
  mocks.adapter.mockImplementation(async (config) => {
    calls.push(config.url)
    const data =
      config.url === "/auth/token/refresh"
        ? { code: 0, data: { accessToken: "latest-access", refreshToken: "latest-refresh" } }
        : config.headers.get("Authorization") === "Bearer latest-access"
          ? { code: 0, data: true }
          : { code: 14002, data: null }
    return { status: 200, statusText: "OK", headers: {}, config, data }
  })
  try {
    expect((await request({ url: "/protected" })).error).not.toBeNull()
    expect(calls).toEqual(["/protected"])
    expect((await fetchLogout()).data).toBe(true)
    expect(calls).toEqual(["/protected", "/auth/logout", "/auth/token/refresh", "/auth/logout"])
  } finally {
    setLogoutSession(null)
  }
})

it("logout waits for an in-flight refresh and sends the rotated access token", async () => {
  mocks.storage.clear()
  mocks.storage.set("token", "old-access")
  mocks.storage.set("refreshToken", "old-refresh")
  vi.stubEnv("VITE_SERVICE_SUCCESS_CODE", "0")
  vi.stubEnv("VITE_SERVICE_EXPIRED_TOKEN_CODES", "14002")
  let release!: () => void
  const blocked = new Promise<void>((resolve) => {
    release = resolve
  })
  const logoutHeaders: string[] = []
  mocks.adapter.mockImplementation(async (config) => {
    let data
    if (config.url === "/auth/token/refresh") {
      await blocked
      data = { code: 0, data: { accessToken: "latest-access", refreshToken: "latest-refresh" } }
    } else if (config.url === "/auth/logout") {
      logoutHeaders.push(config.headers.get("Authorization"))
      data = { code: 0, data: true }
    } else
      data = config.headers.get("Authorization") === "Bearer old-access" ? { code: 14002 } : { code: 0, data: true }
    return { status: 200, statusText: "OK", headers: {}, config, data }
  })
  const business = request({ url: "/protected" })
  await vi.waitFor(() => expect(request.state.refreshTokenPromise).not.toBeNull())
  setLogoutSession(getAuthSession())
  try {
    const logout = fetchLogout()
    await Promise.resolve()
    expect(logoutHeaders).toEqual([])
    release()
    await Promise.all([logout, business])
    expect(logoutHeaders).toEqual(["Bearer latest-access"])
  } finally {
    setLogoutSession(null)
    release()
  }
})
