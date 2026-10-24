// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest"
import { createImpersonationSession } from "@/features/auth/impersonation-session"
import { beginImpersonation, getCredentials, readImpersonation } from "@/features/auth/impersonation-storage"
import { getAuthSession } from "@/services/auth-session"

const created = {
  sessionId: "session-1",
  accessToken: "subject-access",
  expiresAt: "2099-01-01T00:00:00Z",
  subject: { id: "subject-1", name: "Subject", username: "subject" },
}
const current = {
  ...created,
  actor: { id: "actor-1", name: "Actor", username: "actor" },
  createdAt: "2026-01-01T00:00:00Z",
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}
function setup() {
  localStorage.setItem("accessToken", "actor-access")
  localStorage.setItem("refreshToken", "actor-refresh")
  getAuthSession()
  const deps = {
    create: vi.fn(async () => ({ data: created, error: null as unknown })),
    validate: vi.fn(async () => ({ data: current, error: null as unknown })),
    stop: vi.fn(async () => {}),
    clearRuntime: vi.fn(async () => {}),
    loadIdentity: vi.fn(async (_isCurrent: () => boolean) => true),
    navigate: vi.fn(async (_path: string) => {}),
    login: vi.fn(async () => {}),
    changed: vi.fn(),
    busy: vi.fn(),
  }
  return { deps, coordinator: createImpersonationSession(deps) }
}
afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})
test("enter deduplicates creation, isolates runtime and loads subject before navigation", async () => {
  const { deps, coordinator } = setup()
  const gate = deferred<{ data: typeof created; error: unknown }>()
  deps.create.mockReturnValue(gate.promise)
  const first = coordinator.enter({ targetUserId: "subject-1", reason: "Support" }, "/manage/user")
  const second = coordinator.enter({ targetUserId: "subject-1" }, "/different")
  expect(deps.create).toHaveBeenCalledTimes(1)
  gate.resolve({ data: created, error: null })
  expect(await first).toBe(true)
  expect(await second).toBe(true)
  expect(deps.loadIdentity).toHaveBeenCalledTimes(1)
  expect(deps.navigate).toHaveBeenCalledWith("/")
  expect(deps.clearRuntime.mock.invocationCallOrder[0]).toBeLessThan(deps.loadIdentity.mock.invocationCallOrder[0])
  expect(await coordinator.enter({ targetUserId: "other" }, "/")).toBe(false)
  expect(deps.create).toHaveBeenCalledTimes(1)
  await coordinator.stop()
  expect(getCredentials()).toEqual({ accessToken: "actor-access", refreshToken: "actor-refresh" })
  expect(deps.navigate).toHaveBeenLastCalledWith("/manage/user")
})
test("offline stop is deduplicated and still restores the actor", async () => {
  const { deps, coordinator } = setup()
  await coordinator.enter({ targetUserId: "subject-1" }, "/manage/user")
  const gate = deferred<void>()
  deps.stop.mockReturnValue(
    gate.promise.then(() => {
      throw new Error("offline")
    }),
  )
  const first = coordinator.stop(),
    second = coordinator.stop()
  gate.resolve()
  await Promise.all([first, second])
  expect(deps.stop).toHaveBeenCalledTimes(1)
  expect(getCredentials().accessToken).toBe("actor-access")
  expect(readImpersonation()).toBeNull()
})
test("subject initialization failure restores the actor; actor initialization failure goes to login", async () => {
  const { deps, coordinator } = setup()
  deps.loadIdentity.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
  expect(await coordinator.enter({ targetUserId: "subject-1" }, "/manage/user")).toBe(false)
  expect(getCredentials().accessToken).toBe("actor-access")
  expect(deps.navigate).toHaveBeenLastCalledWith("/manage/user")
  beginImpersonation(created, "/manage/user")
  deps.loadIdentity.mockResolvedValue(false)
  await coordinator.restore()
  expect(getCredentials()).toEqual({ accessToken: "", refreshToken: "" })
  expect(deps.login).toHaveBeenCalledTimes(1)
})
test("late creation and stop cannot replace a newer login", async () => {
  const { deps, coordinator } = setup()
  const gate = deferred<{ data: typeof created; error: unknown }>()
  deps.create.mockReturnValue(gate.promise)
  const entering = coordinator.enter({ targetUserId: "subject-1" }, "/")
  localStorage.setItem("accessToken", "new-access")
  localStorage.setItem("refreshToken", "new-refresh")
  gate.resolve({ data: created, error: null })
  expect(await entering).toBe(false)
  expect(getCredentials().accessToken).toBe("new-access")
  beginImpersonation(created, "/manage/user")
  const stoppingGate = deferred<void>()
  deps.stop.mockReturnValue(stoppingGate.promise)
  const stopping = coordinator.stop()
  localStorage.removeItem("impersonation")
  localStorage.removeItem("impersonator")
  localStorage.setItem("accessToken", "third-access")
  localStorage.setItem("refreshToken", "third-refresh")
  stoppingGate.resolve()
  await stopping
  expect(getCredentials().accessToken).toBe("third-access")
  expect(deps.loadIdentity).not.toHaveBeenCalled()
})
test("validation deduplicates, rejects mismatched sessions and ignores old replies after restore", async () => {
  const { deps, coordinator } = setup()
  await coordinator.enter({ targetUserId: "subject-1" }, "/manage/user")
  const gate = deferred<{ data: typeof current; error: unknown }>()
  deps.validate.mockReturnValue(gate.promise)
  const first = coordinator.validate(),
    second = coordinator.validate()
  expect(deps.validate).toHaveBeenCalledTimes(1)
  gate.resolve({ data: { ...current, sessionId: "wrong-session" }, error: null })
  expect(await first).toBe(false)
  expect(await second).toBe(false)
  expect(getCredentials().accessToken).toBe("actor-access")
  await coordinator.enter({ targetUserId: "subject-1" }, "/manage/user")
  const old = deferred<{ data: typeof current; error: unknown }>()
  deps.validate.mockReturnValue(old.promise)
  const validating = coordinator.validate()
  await coordinator.restore()
  old.resolve({ data: current, error: null })
  expect(await validating).toBe(false)
  expect(readImpersonation()).toBeNull()
})
test("expired validation restores without retaining subject credentials", async () => {
  const { deps, coordinator } = setup()
  await coordinator.enter({ targetUserId: "subject-1" }, "/manage/user")
  deps.validate.mockResolvedValue({ data: { ...current, expiresAt: "2000-01-01T00:00:00Z" }, error: null })
  expect(await coordinator.validate()).toBe(false)
  expect(getCredentials().accessToken).toBe("actor-access")
})
