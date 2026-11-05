import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  fetchRefreshToken: vi.fn(),
  syncAccessToken: vi.fn(),
  resetStore: vi.fn(),
  set: vi.fn(),
  get: vi.fn(),
}))

vi.mock("@/service/api", () => ({ fetchRefreshToken: mocks.fetchRefreshToken }))
vi.mock("@/store/modules/auth", () => ({
  useAuthStore: () => ({ syncAccessToken: mocks.syncAccessToken, resetStore: mocks.resetStore }),
}))
vi.mock("@/utils/storage", () => ({ localStg: { get: mocks.get, set: mocks.set } }))

import { handleExpiredRequest } from "@/service/request/shared"

describe("request token refresh", () => {
  afterEach(() => vi.restoreAllMocks())
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.get.mockImplementation((key: string) => (key === "refreshToken" ? "old-refresh" : null))
    mocks.fetchRefreshToken.mockResolvedValue({
      data: { accessToken: "new-access", refreshToken: "new-refresh" },
      error: null,
    })
  })

  it("synchronizes the auth store and socket lifecycle after refresh", async () => {
    mocks.fetchRefreshToken.mockResolvedValue({
      data: { accessToken: "new-access", refreshToken: "new-refresh" },
      error: null,
    })
    const state = { refreshTokenPromise: null } as any

    expect(await handleExpiredRequest(state)).toBe(true)
    expect(mocks.syncAccessToken).toHaveBeenCalledWith("new-access")
  })
  it("logs shared refresh waiters and resets their count without exposing tokens", async () => {
    const output = vi.spyOn(console, "debug").mockImplementation(() => {})
    let finish!: (value: unknown) => void
    mocks.fetchRefreshToken.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const state = { refreshTokenPromise: null, refreshTokenWaiters: 0 } as any
    const first = handleExpiredRequest(state)
    const second = handleExpiredRequest(state)
    expect(output.mock.calls).toContainEqual([
      expect.stringContaining("[auth-refresh]"),
      "Token refresh waiting",
      { waiting_requests: 2 },
    ])
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"))
    finish({ data: { accessToken: "new-access", refreshToken: "new-refresh" }, error: null })
    expect(await Promise.all([first, second])).toEqual([true, true])
    expect(state.refreshTokenWaiters).toBe(0)
    expect(JSON.stringify(output.mock.calls)).not.toMatch(/old-refresh|new-access|new-refresh/)
    expect(mocks.fetchRefreshToken).toHaveBeenCalledOnce()
  })
  it("clears the shared promise immediately so subsequent expiry rotates again", async () => {
    const state = { refreshTokenPromise: null } as any
    await handleExpiredRequest(state)
    expect(state.refreshTokenPromise).toBeNull()
    await handleExpiredRequest(state)
    expect(mocks.fetchRefreshToken).toHaveBeenCalledTimes(2)
  })

  it("does not call refresh without a refresh token", async () => {
    mocks.get.mockReturnValue(null)
    expect(await handleExpiredRequest({ refreshTokenPromise: null } as any)).toBe(false)
    expect(mocks.fetchRefreshToken).not.toHaveBeenCalled()
    expect(mocks.resetStore).toHaveBeenCalledTimes(1)
  })

  it("shares network failures and resets once", async () => {
    mocks.fetchRefreshToken.mockRejectedValue(new Error("network"))
    const state = { refreshTokenPromise: null } as any
    expect(await Promise.all([handleExpiredRequest(state), handleExpiredRequest(state)])).toEqual([false, false])
    expect(mocks.resetStore).toHaveBeenCalledTimes(1)
    expect(state.refreshTokenPromise).toBeNull()
  })

  it("does not overwrite a changed session", async () => {
    mocks.fetchRefreshToken.mockImplementation(async () => {
      mocks.get.mockImplementation((key: string) => (key === "refreshToken" ? "another-session" : null))
      return { data: { accessToken: "new-access", refreshToken: "new-refresh" }, error: null }
    })
    expect(await handleExpiredRequest({ refreshTokenPromise: null } as any)).toBe(false)
    expect(mocks.set).not.toHaveBeenCalled()
    expect(mocks.resetStore).not.toHaveBeenCalled()
  })
})

it("serializes refresh across browser contexts and reuses the rotated token in the waiting context", async () => {
  vi.clearAllMocks()
  mocks.fetchRefreshToken.mockResolvedValue({
    data: { accessToken: "new-access", refreshToken: "new-refresh" },
    error: null,
  })
  const values = new Map<string, string>([
    ["token", "old-access"],
    ["refreshToken", "old-refresh"],
  ])
  mocks.get.mockImplementation((key: string) => values.get(key))
  mocks.set.mockImplementation((key: string, value: string) => values.set(key, value))
  let queue = Promise.resolve<unknown>(undefined)
  const requestLock = vi.fn((_name: string, callback: () => Promise<unknown>) => {
    const pending = queue.then(callback)
    queue = pending.catch(() => undefined)
    return pending
  })
  vi.stubGlobal("navigator", { locks: { request: requestLock } })
  try {
    const first = { refreshTokenPromise: null } as any
    const second = { refreshTokenPromise: null } as any
    expect(await Promise.all([handleExpiredRequest(first), handleExpiredRequest(second)])).toEqual([true, true])
    expect(mocks.fetchRefreshToken).toHaveBeenCalledOnce()
    expect(mocks.resetStore).not.toHaveBeenCalled()
  } finally {
    vi.unstubAllGlobals()
    mocks.set.mockReset()
  }
})

it("does not reuse credentials from a new login while waiting for the browser lock", async () => {
  vi.clearAllMocks()
  const access = (jti: string) => `header.${btoa(JSON.stringify({ sub: "same-user", jti }))}.signature`
  const values = new Map<string, string>([
    ["token", access("old-login")],
    ["refreshToken", "old-refresh"],
  ])
  mocks.get.mockImplementation((key: string) => values.get(key))
  let release!: () => void
  const waiting = new Promise<void>((resolve) => {
    release = resolve
  })
  const requestLock = vi.fn(async (_name: string, callback: () => Promise<boolean>) => {
    await waiting
    return callback()
  })
  vi.stubGlobal("navigator", { locks: { request: requestLock } })
  try {
    const result = handleExpiredRequest({ refreshTokenPromise: null } as any)
    await vi.waitFor(() => expect(requestLock).toHaveBeenCalledOnce())
    values.set("token", access("new-login"))
    values.set("refreshToken", "different-refresh")
    release()
    expect(await result).toBe(false)
    expect(mocks.fetchRefreshToken).not.toHaveBeenCalled()
    expect(mocks.syncAccessToken).not.toHaveBeenCalled()
    expect(mocks.resetStore).not.toHaveBeenCalled()
  } finally {
    release()
    vi.unstubAllGlobals()
  }
})
