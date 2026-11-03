import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { createPermissionSync } from "@/store/modules/auth/permission-sync"
import { createPermissionRefresher } from "@/store/modules/auth/permission-refresh"
import { getDiagnosticPackage, resetDiagnostics } from "@/utils/diagnostics"
beforeEach(() => {
  vi.useFakeTimers()
  resetDiagnostics()
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})
const events = () => getDiagnosticPackage().events.filter((e) => e.category === "permission")
const makeSync = (refresh: () => Promise<void> = vi.fn(async () => {})) =>
  createPermissionSync({
    getUser: () => ({ isAdmin: false, roles: ["private-role"] }),
    refresh,
    maxDelay: 10,
    random: () => 1,
  })

it("records fixed sources and safe suppression counts without server permissions", async () => {
  const refresh = vi.fn(async () => {})
  const sync = makeSync(refresh)
  sync.signal({ scope: "roles", roles: ["private-role"], revision: 1 })
  sync.signal({ scope: "roles", roles: ["private-role"], revision: 1 })
  sync.signal({ scope: "menu", revision: 2 })
  await vi.advanceTimersByTimeAsync(10)
  sync.trigger("socket_reconnect")
  await vi.advanceTimersByTimeAsync(0)
  sync.trigger("permission_denied")
  expect(events()).toContainEqual(
    expect.objectContaining({ operation: "permission.sync", phase: "start", source: "server_signal" }),
  )
  expect(events()).toContainEqual(expect.objectContaining({ phase: "start", source: "socket_reconnect" }))
  for (const reason of ["stale_revision", "coalesced", "throttled"])
    expect(events()).toContainEqual(
      expect.objectContaining({ phase: "skipped", reason_code: reason, observation_count: 1 }),
    )
  expect(refresh).toHaveBeenCalledTimes(2)
  expect(JSON.stringify(getDiagnosticPackage())).not.toContain("private-")
})

it("records retry, fetch failure and a safe sync completion without applying an absent snapshot", async () => {
  const apply = vi.fn(async () => {})
  const refresher = createPermissionRefresher({
    fetchLatest: vi.fn(async () => null),
    canAccessCurrent: () => true,
    apply,
    confirm: vi.fn(),
    retryDelay: 10,
  })
  const sync = makeSync(refresher.refresh)
  sync.trigger("permission_denied")
  await vi.advanceTimersByTimeAsync(10)
  expect(events().filter((e) => e.operation === "permission.fetch")).toMatchObject([
    { phase: "start", attempt: 1 },
    { phase: "retrying", attempt: 2 },
    { phase: "failure", reason_code: "no_snapshot", attempt: 2 },
  ])
  expect(events()).toContainEqual(
    expect.objectContaining({
      operation: "permission.sync",
      phase: "success",
      source: "permission_denied",
      duration_ms: expect.any(Number),
    }),
  )
  expect(apply).not.toHaveBeenCalled()
})

it("records deferred application and only the latest confirmed snapshot result", async () => {
  let confirm!: () => void
  const apply = vi.fn(async () => {})
  const fetchLatest = vi
    .fn()
    .mockResolvedValueOnce({ secret: "private-old", accessible: false })
    .mockResolvedValueOnce({ secret: "private-new", accessible: true })
  const refresher = createPermissionRefresher({
    fetchLatest,
    canAccessCurrent: (s: any) => s.accessible,
    apply,
    confirm: (fn) => {
      confirm = fn
    },
  })
  await refresher.refresh()
  await refresher.refresh()
  expect(events()).toContainEqual(
    expect.objectContaining({ operation: "permission.apply", phase: "pending", reason_code: "confirmation_required" }),
  )
  expect(apply).not.toHaveBeenCalled()
  confirm()
  await vi.advanceTimersByTimeAsync(0)
  expect(apply).toHaveBeenCalledWith({ secret: "private-new", accessible: true }, false)
  expect(events().filter((e) => e.operation === "permission.apply" && e.phase === "success")).toMatchObject([
    { reason_code: "access_retained" },
  ])
  expect(JSON.stringify(getDiagnosticPackage())).not.toContain("private-")
})

it("preserves failures while logging only fixed error codes", async () => {
  const error = new Error("private-error")
  const output = vi.spyOn(console, "error").mockImplementation(() => {})
  const sync = makeSync(
    vi.fn(async () => {
      throw error
    }),
  )
  sync.trigger()
  await vi.advanceTimersByTimeAsync(0)
  expect(events()).toContainEqual(
    expect.objectContaining({ operation: "permission.sync", phase: "failure", reason_code: "refresh_failed" }),
  )
  const refresher = createPermissionRefresher({
    fetchLatest: async () => ({ private: "private-permission" }),
    canAccessCurrent: () => true,
    apply: async () => {
      throw error
    },
    confirm: vi.fn(),
  })
  await expect(refresher.refresh()).rejects.toBe(error)
  expect(events()).toContainEqual(
    expect.objectContaining({ operation: "permission.apply", phase: "failure", reason_code: "apply_failed" }),
  )
  expect(JSON.stringify([getDiagnosticPackage(), output.mock.calls])).not.toContain("private-")
})

it("cancels pending work and drops stale results across both reset generations", async () => {
  let finish!: () => void
  const sync = makeSync(
    vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    ),
  )
  sync.trigger()
  sync.reset()
  expect(events()).toContainEqual(expect.objectContaining({ phase: "cancelled", reason_code: "reset" }))
  resetDiagnostics()
  finish()
  await vi.advanceTimersByTimeAsync(0)
  expect(events()).toEqual([])
  let fetch!: (value: any) => void
  const apply = vi.fn(async () => {})
  const refresher = createPermissionRefresher({
    fetchLatest: () =>
      new Promise((resolve) => {
        fetch = resolve
      }),
    canAccessCurrent: () => true,
    apply,
    confirm: vi.fn(),
  })
  const pending = refresher.refresh()
  refresher.reset()
  resetDiagnostics()
  fetch({ secret: "private-stale" })
  await pending
  expect(events()).toEqual([])
  expect(apply).not.toHaveBeenCalled()
})

it("does not place callbacks scheduled under an old diagnostic owner in the new timeline", async () => {
  const refresher = createPermissionRefresher({
    fetchLatest: async () => ({}),
    canAccessCurrent: () => true,
    apply: async () => {},
    confirm: vi.fn(),
  })
  const sync = makeSync(refresher.refresh)
  sync.signal({ scope: "menu", revision: 1 })
  resetDiagnostics()
  await vi.advanceTimersByTimeAsync(10)
  expect(events()).toEqual([])
})
