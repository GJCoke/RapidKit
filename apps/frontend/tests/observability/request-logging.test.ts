import { createRequire } from "node:module"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

const { AxiosError } = createRequire(new URL("../../../../packages/axios/package.json", import.meta.url))("axios")
const mock = vi.hoisted(() => ({ adapter: vi.fn(), storage: new Map<string, unknown>() }))
vi.mock("@rapidkit/axios", async () => {
  const actual = await import("../../../../packages/axios/src/index")
  return {
    ...actual,
    createFlatRequest: (config: any, options: any) =>
      actual.createFlatRequest({ ...config, adapter: mock.adapter }, options),
  }
})
vi.mock("@/utils/storage", () => ({ localStg: { get: (key: string) => mock.storage.get(key) ?? null } }))
vi.mock("@/utils/service", () => ({ getServiceBaseURL: () => ({ baseURL: "/api/v1" }) }))
vi.mock("@/locales", () => ({ $t: (key: string) => key }))
vi.mock("@/store/modules/auth", () => ({ useAuthStore: () => ({}) }))
import { request } from "@/service/request"

beforeEach(() => {
  vi.stubEnv("VITE_SERVICE_SUCCESS_CODE", "0")
  vi.stubGlobal("window", {})
  mock.storage.clear()
  mock.storage.set("token", "private-authorization")
  mock.adapter.mockReset()
  vi.spyOn(console, "debug").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

it("logs safe request outcomes and monotonic elapsed time without credentials or bodies", async () => {
  mock.adapter.mockImplementation(async (config) => ({
    config,
    status: 200,
    statusText: "OK",
    headers: { "x-request-id": "abcdefghijklmnopqrstu" },
    data: { code: 0, data: { secret: "private-response" } },
  }))
  const result = await request({
    url: "/users?token=private-query#private-fragment",
    method: "post",
    data: { password: "private-body" },
  })
  expect(result.error).toBeNull()
  const calls = vi.mocked(console.debug).mock.calls.filter(([prefix]) => String(prefix).includes("[request]"))
  expect(calls).toHaveLength(2)
  expect(calls[0][2]).toMatchObject({
    method: "POST",
    path: "/users",
    request_id: expect.stringMatching(/^[\w-]{21}$/),
  })
  expect(calls[1][2]).toMatchObject({
    method: "POST",
    path: "/users",
    status: 200,
    business_code: 0,
    request_id: "abcdefghijklmnopqrstu",
    duration_ms: expect.any(Number),
  })
  expect((calls[1][2] as { duration_ms: number }).duration_ms).toBeGreaterThanOrEqual(0)
  expect(JSON.stringify(calls)).not.toContain("private-")
})

it("logs failed HTTP attempts once and safely summarizes the captured Axios error", async () => {
  mock.adapter.mockImplementation(async (config) => {
    throw new AxiosError("private-error", "ERR_BAD_RESPONSE", config, null, {
      config,
      status: 503,
      headers: { "x-request-id": "abcdefghijklmnopqrstu" },
      data: { code: 7001, data: "private-response" },
    })
  })
  const result = await request({ url: "/users?password=private-query", method: "post", data: "private-body" })
  expect(result.error).not.toBeNull()
  const calls = vi.mocked(console.debug).mock.calls.filter(([prefix]) => String(prefix).includes("[request]"))
  expect(calls).toHaveLength(2)
  expect(calls[1][2]).toMatchObject({ status: 503, business_code: 7001, request_id: "abcdefghijklmnopqrstu" })
  expect(JSON.stringify([...calls, ...vi.mocked(console.error).mock.calls])).not.toContain("private-")
})
