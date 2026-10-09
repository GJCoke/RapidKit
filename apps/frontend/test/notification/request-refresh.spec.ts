import { beforeEach, describe, expect, it, vi } from "vitest"

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
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.get.mockReturnValue("old-refresh")
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
      mocks.get.mockReturnValue("another-session")
      return { data: { accessToken: "new-access", refreshToken: "new-refresh" }, error: null }
    })
    expect(await handleExpiredRequest({ refreshTokenPromise: null } as any)).toBe(false)
    expect(mocks.set).not.toHaveBeenCalled()
    expect(mocks.resetStore).not.toHaveBeenCalled()
  })
})
