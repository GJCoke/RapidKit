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
})
