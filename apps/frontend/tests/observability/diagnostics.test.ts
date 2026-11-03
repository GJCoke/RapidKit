import { afterEach, beforeEach, expect, it, vi } from "vitest"
import * as diagnostics from "@/utils/diagnostics"
import { requestIdsFromHeaders } from "@rapidkit/utils"

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "performance"] })
  vi.setSystemTime(new Date("2026-11-03T00:00:00Z"))
  diagnostics.resetDiagnostics()
})
afterEach(() => vi.useRealTimers())

it("records only fixed codes and safe scalar fields, never arbitrary content", () => {
  diagnostics.recordDiagnosticEvent({
    category: "request",
    phase: "failure",
    operation: "user.create",
    method: "POST",
    request_id: "abcdefghijklmnopqrstu",
    client_request_id: "ABCDEFGHIJKLMNOPQRSTU",
    http_status: 500,
    url: "https://app.test?password=private-query",
    message: "private-message",
    data: { token: "private-body" },
    route: "private-route",
    user_id: "private-user",
    duration_ms: -1,
  } as any)
  const report = diagnostics.getDiagnosticPackage()
  expect(report.events).toHaveLength(1)
  expect(report.events[0]).toMatchObject({
    category: "request",
    phase: "failure",
    operation: "user.create",
    http_status: 500,
  })
  expect(JSON.stringify(report)).not.toContain("private-")
  expect(report.events[0]).not.toHaveProperty("duration_ms")
})

it("bounds the timeline by count, age and UTF-8 bytes", () => {
  for (let i = 0; i < 100; i++)
    diagnostics.recordDiagnosticEvent({ category: "navigation", phase: "success", route: "home" })
  expect(diagnostics.getDiagnosticPackage().events).toHaveLength(50)
  vi.advanceTimersByTime(300001)
  expect(diagnostics.getDiagnosticPackage().events).toEqual([])
  for (let i = 0; i < 100; i++)
    diagnostics.recordDiagnosticEvent({
      category: "request",
      phase: "success",
      operation: "role.permissions.save",
      method: "POST",
      http_status: 200,
      business_code: 0,
      duration_ms: 100,
      action_id: "abcdefghijklmnopqrstu",
      client_request_id: "ABCDEFGHIJKLMNOPQRSTU",
      request_id: "abcdefghijklmnopqrstu",
      edge_request_id: "a".repeat(32),
    })
  const events = diagnostics.getDiagnosticPackage().events
  expect(new TextEncoder().encode(JSON.stringify(events)).length).toBeLessThanOrEqual(16384)
  expect(events.every((event) => new TextEncoder().encode(JSON.stringify(event)).length <= 512)).toBe(true)
})

it("freezes an error's context and retains only safe asset stack positions", () => {
  diagnostics.recordDiagnosticEvent({ category: "navigation", phase: "success", route: "home" })
  const error = new TypeError("private-error")
  error.stack = "TypeError: private-error\n at fn (https://app.test/assets/main-a1.js:12:7)\n at /private-source:1:1"
  const id = diagnostics.captureDiagnosticError(error, "render")
  diagnostics.recordDiagnosticEvent({ category: "navigation", phase: "success", route: "manage_user" })
  const report = diagnostics.getDiagnosticPackage()
  expect(report.incidents[0]).toMatchObject({
    diagnostic_id: id,
    error_type: "TypeError",
    frames: [{ file: "main-a1.js", line: 12, column: 7 }],
  })
  expect(report.incidents[0].events).toHaveLength(1)
  expect(report.events).toHaveLength(2)
  expect(JSON.stringify(report)).not.toContain("private-")
  report.incidents[0].events.length = 0
  expect(diagnostics.getDiagnosticPackage().incidents[0].events).toHaveLength(1)
})

it("deduplicates the same Error and rate limits repeated failures", () => {
  const error = new Error("private-error")
  const first = diagnostics.captureDiagnosticError(error, "runtime")
  expect(diagnostics.captureDiagnosticError(error, "runtime")).toBe(first)
  expect(diagnostics.getDiagnosticPackage().incidents).toHaveLength(1)
  for (let i = 0; i < 50; i++) diagnostics.captureDiagnosticError(new Error("private-error"), "runtime")
  expect(diagnostics.getDiagnosticPackage().incidents.length).toBeLessThanOrEqual(3)
  expect(diagnostics.getDiagnosticPackage().dropped_count).toBeGreaterThan(0)
})

it("clears frozen and live context on identity change, ignoring stale actions", () => {
  const action = diagnostics.startDiagnosticAction("user.create.submit")
  diagnostics.captureDiagnosticError(new Error(), "request", { action_id: action.actionId })
  const oldPage = diagnostics.getDiagnosticPackage().page_instance_id
  diagnostics.resetDiagnostics()
  diagnostics.finishDiagnosticAction(action, "failure")
  expect(diagnostics.getDiagnosticPackage()).toMatchObject({ events: [], incidents: [], dropped_count: 0 })
  expect(diagnostics.getDiagnosticPackage().page_instance_id).not.toBe(oldPage)
})

it("links only the explicit operation and returns an independent export under 64 KiB", () => {
  const action = diagnostics.startDiagnosticAction("role.permissions.save")
  diagnostics.recordDiagnosticEvent({
    category: "request",
    phase: "success",
    action_id: action.actionId,
    request_id: "abcdefghijklmnopqrstu",
    edge_request_id: "b".repeat(32),
    operation: "role.permissions.save",
  })
  diagnostics.finishDiagnosticAction(action, "success")
  const report = diagnostics.getDiagnosticPackage()
  expect(report.lookup.request_ids).toContain("abcdefghijklmnopqrstu")
  expect(report.lookup.edge_request_ids).toContain("b".repeat(32))
  expect(new TextEncoder().encode(JSON.stringify(report)).length).toBeLessThanOrEqual(65536)
  expect(report.events.filter((event) => event.category === "action")).toHaveLength(2)
})

it("separates application and edge IDs and rejects a swapped namespace", () => {
  expect(
    requestIdsFromHeaders({ "X-Request-ID": "abcdefghijklmnopqrstu", "X-Edge-Request-ID": "a".repeat(32) }),
  ).toEqual({ requestId: "abcdefghijklmnopqrstu", edgeRequestId: "a".repeat(32) })
  expect(
    requestIdsFromHeaders({ "X-Request-ID": "a".repeat(32), "X-Edge-Request-ID": "abcdefghijklmnopqrstu" }),
  ).toEqual({})
})
