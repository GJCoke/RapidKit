import { createRequire } from "node:module"
const { AxiosError } = createRequire(new URL("../../../../packages/axios/package.json", import.meta.url))("axios")
import { beforeEach, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({
  adapter: vi.fn(),
  storage: new Map<string, unknown>(),
  resetStore: vi.fn(),
  syncAccessToken: vi.fn(),
  stopImpersonation: vi.fn(),
  message: vi.fn(),
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
    get: (key: string) => mocks.storage.get(key) ?? null,
    set: (key: string, value: unknown) => mocks.storage.set(key, value),
    remove: (key: string) => mocks.storage.delete(key),
  },
}))
vi.mock("@/store/modules/auth", () => ({ useAuthStore: () => mocks }))
vi.mock("@/utils/service", () => ({ getServiceBaseURL: () => ({ baseURL: "/api/v1", otherBaseURL: {} }) }))
vi.mock("@/locales", () => ({ $t: (key: string) => key }))
import { request } from "@/service/request"

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv("VITE_SERVICE_SUCCESS_CODE", "0")
  vi.stubEnv("VITE_SERVICE_EXPIRED_TOKEN_CODES", "14002")
  vi.stubEnv("VITE_SERVICE_LOGOUT_CODES", "14003,14008")
  vi.stubGlobal("window", { $message: { error: mocks.message } })
  mocks.storage.clear()
  mocks.storage.set("token", "simulated")
  mocks.storage.set("impersonation", { sessionId: "session" })
  mocks.stopImpersonation.mockImplementation(async () => {
    mocks.storage.delete("impersonation")
    mocks.storage.set("token", "administrator")
    mocks.storage.set("refreshToken", "administrator-refresh")
  })
  request.state.errMsgStack = []
  request.state.refreshTokenPromise = null
})

it.each([14017, 14002, 14003, 14008])(
  "restores on simulated code %s without refresh or mutation replay",
  async (code) => {
    mocks.adapter.mockImplementation(async (config) => ({
      status: 200,
      statusText: "OK",
      headers: {},
      config,
      data: { code, data: null },
    }))
    const result = await request({ url: "/protected-write", method: "post" })
    expect(result.error).not.toBeNull()
    expect(mocks.stopImpersonation).toHaveBeenCalledOnce()
    expect(mocks.resetStore).not.toHaveBeenCalled()
    expect(mocks.adapter).toHaveBeenCalledOnce()
    expect(mocks.adapter.mock.calls[0][0].headers.Authorization).toBe("Bearer simulated")
  },
)

it("restores on actual HTTP401 without replay", async () => {
  mocks.adapter.mockImplementation(async (config) => {
    throw new AxiosError("unauthorized", "ERR_BAD_REQUEST", config, null, {
      status: 401,
      statusText: "Unauthorized",
      headers: {},
      config,
      data: {},
    })
  })
  expect((await request({ url: "/write", method: "post" })).error).not.toBeNull()
  expect(mocks.stopImpersonation).toHaveBeenCalledOnce()
  expect(mocks.adapter).toHaveBeenCalledOnce()
})

it.each([14017, 401])("does not recursively stop from the stop endpoint (%s)", async (code) => {
  mocks.adapter.mockImplementation(async (config) => {
    const response = { status: code === 401 ? 401 : 200, statusText: "error", headers: {}, config, data: { code } }
    if (code === 401) throw new AxiosError("unauthorized", "ERR_BAD_REQUEST", config, null, response)
    return response
  })
  await request({ url: "/auth/impersonations/current", method: "delete" })
  expect(mocks.stopImpersonation).not.toHaveBeenCalled()
  expect(mocks.resetStore).not.toHaveBeenCalled()
})

it("keeps a valid simulation after a denied credential operation", async () => {
  mocks.adapter.mockImplementation(async (config) => ({
    status: 200,
    statusText: "OK",
    headers: {},
    config,
    data: { code: 14018, message: "stop first" },
  }))
  await request({ url: "/auth/logout", method: "post" })
  expect(mocks.stopImpersonation).not.toHaveBeenCalled()
  expect(mocks.storage.has("impersonation")).toBe(true)
  expect(mocks.message).toHaveBeenCalledOnce()
})

it.each(["json", "blob"] as const)("discards stale successful %s data", async (responseType) => {
  let finish!: () => void
  mocks.adapter.mockImplementation(
    (config) =>
      new Promise((resolve) => {
        finish = () =>
          resolve({
            status: 200,
            statusText: "OK",
            headers: {},
            config,
            data: responseType === "json" ? { code: 0, data: "old-subject" } : new Blob(["old-subject"]),
          })
      }),
  )
  const pending = request({ url: "/old", responseType })
  await vi.waitFor(() => expect(finish).toBeTypeOf("function"))
  await mocks.stopImpersonation()
  finish()
  const result = await pending
  expect(result.data).toBeNull()
  expect(result.error?.code).toBe("ERR_CANCELED")
  expect(mocks.message).not.toHaveBeenCalled()
})

it("does not let a pending normal refresh overwrite a simulation", async () => {
  mocks.storage.delete("impersonation")
  mocks.storage.set("token", "old-access")
  mocks.storage.set("refreshToken", "old-refresh")
  let finish!: () => void
  mocks.adapter.mockImplementation((config) => {
    if (config.url === "/auth/token/refresh")
      return new Promise((resolve) => {
        finish = () =>
          resolve({
            status: 200,
            statusText: "OK",
            headers: {},
            config,
            data: { code: 0, data: { accessToken: "late-access", refreshToken: "late-refresh" } },
          })
      })
    return Promise.resolve({ status: 200, statusText: "OK", headers: {}, config, data: { code: 14002 } })
  })
  const pending = request({ url: "/old-normal" })
  await vi.waitFor(() => expect(finish).toBeTypeOf("function"))
  mocks.storage.set("impersonation", { sessionId: "new-session" })
  mocks.storage.set("token", "simulated")
  mocks.storage.delete("refreshToken")
  finish()
  await pending
  expect(mocks.storage.get("token")).toBe("simulated")
  expect(mocks.storage.has("refreshToken")).toBe(false)
  expect(mocks.resetStore).not.toHaveBeenCalled()
  expect(mocks.stopImpersonation).not.toHaveBeenCalled()
})
