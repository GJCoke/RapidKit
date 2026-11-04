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
import { diagnosticRequest } from "@/service/request/diagnostics"
import { getAuthSession } from "@/service/request/auth-session"
import { getDiagnosticPackage, resetDiagnostics, startDiagnosticAction } from "@/utils/diagnostics"

beforeEach(() => {
  vi.stubEnv("VITE_SERVICE_SUCCESS_CODE", "0")
  vi.stubGlobal("window", {})
  mock.storage.clear()
  mock.storage.set("token", "private-authorization")
  getAuthSession()
  resetDiagnostics()
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
    client_request_id: expect.stringMatching(/^[\w-]{21}$/),
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

it("keeps concurrent operations isolated and separates client, application and gateway IDs", async () => {
  const pending: { config: any; finish: (value: unknown) => void }[] = []
  mock.adapter.mockImplementation((config) => new Promise((finish) => pending.push({ config, finish })))
  const one = startDiagnosticAction("user.create.submit")
  const two = startDiagnosticAction("role.permissions.save")
  const first = request({ url: "/users", ...diagnosticRequest("user.create", one) })
  const second = request({ url: "/roles/secret-id/permissions", ...diagnosticRequest("role.permissions.save", two) })
  await vi.waitFor(() => expect(pending).toHaveLength(2))
  for (const entry of [...pending].reverse())
    entry.finish({
      config: entry.config,
      status: 200,
      statusText: "OK",
      headers: {
        "x-request-id": entry.config.url === "/users" ? "abcdefghijklmnopqrstu" : "ABCDEFGHIJKLMNOPQRSTU",
        "x-edge-request-id": "a".repeat(32),
      },
      data: { code: 0, data: true },
    })
  await Promise.all([first, second])
  const events = getDiagnosticPackage().events.filter(
    (event) => event.category === "request" && event.phase === "success",
  )
  expect(events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        action_id: one.actionId,
        operation: "user.create",
        request_id: "abcdefghijklmnopqrstu",
        edge_request_id: "a".repeat(32),
      }),
      expect.objectContaining({
        action_id: two.actionId,
        operation: "role.permissions.save",
        request_id: "ABCDEFGHIJKLMNOPQRSTU",
      }),
    ]),
  )
  expect(events[0].client_request_id).not.toBe(events[1].client_request_id)
  expect(JSON.stringify(getDiagnosticPackage())).not.toContain("secret-id")
})

it("records only an attempted client ID for a response-less network failure", async () => {
  mock.adapter.mockImplementation(async (config) => {
    throw new AxiosError("private-network", "ERR_NETWORK", config)
  })
  await request({ url: "/private-path?token=private-token" })
  const failure = getDiagnosticPackage().events.find(
    (event) => event.category === "request" && event.phase === "failure",
  )
  expect(failure).toMatchObject({ client_request_id: expect.stringMatching(/^[\w-]{21}$/), operation: "other" })
  expect(failure).not.toHaveProperty("request_id")
  expect(failure).not.toHaveProperty("edge_request_id")
  expect(JSON.stringify(getDiagnosticPackage())).not.toContain("private-")
})

it("preserves the action but rotates the attempt ID on replay", async () => {
  mock.adapter.mockImplementation(async (config) => ({
    config,
    status: 200,
    statusText: "OK",
    headers: {},
    data: { code: 0, data: true },
  }))
  const action = startDiagnosticAction("task.run.submit")
  const first = await request({ url: "/tasks/trigger", ...diagnosticRequest("task.run", action) })
  await request({ ...first.response.config, responseType: "json" })
  const starts = getDiagnosticPackage().events.filter(
    (event) => event.category === "request" && event.phase === "start",
  )
  expect(starts.map((event) => event.action_id)).toEqual([action.actionId, action.actionId])
  expect(starts.map((event) => event.attempt)).toEqual([1, 2])
  expect(starts[0].client_request_id).not.toBe(starts[1].client_request_id)
})

it("discards old-identity response context and does not assign an action to polling", async () => {
  let complete!: () => void
  mock.adapter.mockImplementation(
    (config) =>
      new Promise((finish) => {
        complete = () => finish({ config, status: 200, headers: {}, data: { code: 0, data: true } })
      }),
  )
  const action = startDiagnosticAction("user.create.submit")
  const pending = request({ url: "/users", ...diagnosticRequest("user.create", action) })
  await vi.waitFor(() => expect(complete).toBeTypeOf("function"))
  mock.storage.set("token", "changed-identity")
  getAuthSession()
  complete()
  expect((await pending).error?.code).toBe("ERR_CANCELED")
  expect(getDiagnosticPackage().events).toEqual([])
  mock.adapter.mockImplementation(async (config) => ({
    config,
    status: 200,
    headers: {},
    data: { code: 0, data: true },
  }))
  await request({ url: "/poll" })
  expect(getDiagnosticPackage().events.every((event) => !event.action_id)).toBe(true)
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

it("keeps separately submitted actions independent even when their endpoint and error match", async () => {
  const notice = vi.fn((_options: unknown) => ({ destroy: vi.fn() }))
  window.$notification = { error: notice } as any
  mock.adapter.mockImplementation(async (config) => ({
    config,
    status: 503,
    statusText: "Unavailable",
    headers: { "x-request-id": "a".repeat(21) },
    data: { code: 7001, message: "private-body" },
  }))
  const first = startDiagnosticAction("user.create.submit")
  const second = startDiagnosticAction("user.create.submit")
  await request({ url: "/users", method: "post", ...diagnosticRequest("user.create", first) })
  await request({ url: "/users", method: "post", ...diagnosticRequest("user.create", second) })
  expect(notice).toHaveBeenCalledTimes(2)
  await request({ url: "/users", method: "post", ...diagnosticRequest("user.create", first) })
  expect(notice).toHaveBeenCalledTimes(2)
  expect((notice.mock.calls[0][0] as any).content().props.count).toBe(2)
})
