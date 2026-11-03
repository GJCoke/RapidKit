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
import * as users from "@/service/api/system-manage"
import * as worker from "@/service/api/worker"
import * as impersonation from "@/service/api/impersonation"
import * as notification from "@/service/api/notification"
import { diagnosticMutation } from "@/service/request/diagnostics"
import { getAuthSession } from "@/service/request/auth-session"
import {
  getDiagnosticPackage,
  resetDiagnostics,
  startDiagnosticAction,
  finishDiagnosticAction,
} from "@/utils/diagnostics"

const data = { name: "private-name", password: "private-password", content: "private-content" } as any
const cases = [
  ["user.update", () => users.fetchUpdateUser("private-id", data), "put", "/users/private-id"],
  ["user.delete", () => users.fetchDeleteUser("private-id"), "delete", "/users/private-id"],
  ["user.batch_delete", () => users.fetchBatchDeleteUsers(["private-id"]), "delete", "/users"],
  ["user.password.change", () => users.fetchChangePassword("private-id", data), "put", "/users/private-id/password"],
  ["role.create", () => users.fetchCreateRole(data), "post", "/roles"],
  ["role.update", () => users.fetchUpdateRole("private-id", data), "put", "/roles/private-id"],
  ["role.delete", () => users.fetchDeleteRole("private-id"), "delete", "/roles/private-id"],
  ["role.batch_delete", () => users.fetchBatchDeleteRoles(["private-id"]), "delete", "/roles"],
  ["impersonation.start", () => impersonation.fetchCreateImpersonation(data), "post", "/auth/impersonations"],
  [
    "impersonation.stop",
    () => impersonation.fetchDeleteCurrentImpersonation(),
    "delete",
    "/auth/impersonations/current",
  ],
  ["task.revoke", () => worker.fetchRevokeTask("private-id"), "post", "/tasks/private-id/revoke"],
  ["schedule.toggle", () => worker.fetchToggleSchedule("private-id"), "patch", "/schedules/private-id/toggle"],
  [
    "notification.publish",
    () => notification.fetchPublishAnnouncement("private-id", data),
    "post",
    "/admin/notifications/private-id/publish",
  ],
  [
    "notification.cancel",
    () => notification.fetchCancelAnnouncement("private-id"),
    "post",
    "/admin/notifications/private-id/cancel",
  ],
  [
    "notification.recall",
    () => notification.fetchRecallAnnouncement("private-id"),
    "post",
    "/admin/notifications/private-id/recall",
  ],
  [
    "notification.retry",
    () => notification.fetchRetryFailedDeliveries("private-id"),
    "post",
    "/admin/notification-deliveries/private-id/retry-failed",
  ],
] as const
const reply = (config: any, code = 0) => ({
  config,
  status: 200,
  statusText: "OK",
  headers: { "x-request-id": "a".repeat(21), "x-edge-request-id": "b".repeat(32) },
  data: { code, data: { private: "private-response" } },
})
beforeEach(() => {
  vi.stubEnv("VITE_SERVICE_SUCCESS_CODE", "0")
  vi.stubGlobal("window", {})
  mock.storage.clear()
  mock.storage.set("token", "private-token")
  getAuthSession()
  resetDiagnostics()
  mock.adapter.mockReset().mockImplementation(async (config) => reply(config))
  vi.spyOn(console, "debug").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

it.each(cases)("correlates %s without changing request or response", async (code, invoke, method, url) => {
  const result = await invoke()
  expect(result.error).toBeNull()
  expect(result.data).toEqual({ private: "private-response" })
  expect(mock.adapter.mock.calls[0][0]).toMatchObject({ method, url })
  if (code === "impersonation.stop") expect(mock.adapter.mock.calls[0][0].timeout).toBe(5000)
  const events = getDiagnosticPackage().events
  const start = events.find((e) => e.category === "action" && e.phase === "start")!
  expect(start).toMatchObject({ action_code: code, action_id: expect.stringMatching(/^[\w-]{21}$/) })
  expect(events.filter((e) => e.category === "request")).toMatchObject([
    { phase: "start", action_id: start.action_id, operation: code },
    {
      phase: "success",
      action_id: start.action_id,
      operation: code,
      request_id: "a".repeat(21),
      edge_request_id: "b".repeat(32),
    },
  ])
  expect(events.at(-1)).toMatchObject({ category: "action", phase: "success", action_id: start.action_id })
  expect(JSON.stringify(getDiagnosticPackage())).not.toContain("private-")
})

it("keeps overlapping mutations independent when they finish in reverse order", async () => {
  const pending: { config: any; finish: (value: any) => void }[] = []
  mock.adapter.mockImplementation((config) => new Promise((finish) => pending.push({ config, finish })))
  const one = users.fetchDeleteUser("one"),
    two = users.fetchDeleteRole("two")
  await vi.waitFor(() => expect(pending).toHaveLength(2))
  for (const p of [...pending].reverse()) p.finish(reply(p.config))
  await Promise.all([one, two])
  const events = getDiagnosticPackage().events
  const starts = events.filter((e) => e.category === "action" && e.phase === "start")
  expect(new Set(starts.map((e) => e.action_id)).size).toBe(2)
  for (const action of starts) {
    expect(events.filter((e) => e.category === "request" && e.action_id === action.action_id)).toMatchObject([
      { operation: action.action_code, phase: "start" },
      { operation: action.action_code, phase: "success" },
    ])
  }
})

it.each(["business", "network", "cancelled"])("finishes a %s failure without exposing payloads", async (kind) => {
  mock.adapter.mockImplementation(async (config) => {
    if (kind === "business") return reply(config, 7001)
    throw new AxiosError("private-error", kind === "cancelled" ? "ERR_CANCELED" : "ERR_NETWORK", config)
  })
  expect((await users.fetchDeleteUser("private-id")).error).not.toBeNull()
  expect(getDiagnosticPackage().events.at(-1)).toMatchObject({
    category: "action",
    phase: kind === "cancelled" ? "cancelled" : "failure",
  })
  expect(JSON.stringify(getDiagnosticPackage())).not.toContain("private-")
})

it("preserves thrown exceptions and discards stale action completion", async () => {
  const error = new Error("private-error")
  await expect(
    diagnosticMutation("user.delete", () => {
      throw error
    }),
  ).rejects.toBe(error)
  expect(getDiagnosticPackage().events.at(-1)?.phase).toBe("failure")
  let finish!: (value: any) => void
  const pending = diagnosticMutation(
    "role.delete",
    () =>
      new Promise<{ error: null }>((resolve) => {
        finish = resolve
      }),
  )
  resetDiagnostics()
  finish({ error: null })
  await pending
  expect(getDiagnosticPackage().events).toEqual([])
})

it("does not create actions for reads or duplicate the original UI scopes", async () => {
  await users.fetchGetUserList()
  await impersonation.fetchGetCurrentImpersonation()
  await worker.fetchGetSchedulePreview({} as any)
  expect(getDiagnosticPackage().events.every((e) => !e.action_id)).toBe(true)
  const action = startDiagnosticAction("user.create.submit")
  const result = await users.fetchCreateUser(data, action)
  finishDiagnosticAction(action, result.error ? "failure" : "success")
  expect(getDiagnosticPackage().events.filter((e) => e.category === "action")).toHaveLength(2)
})
