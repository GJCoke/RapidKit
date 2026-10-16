import { beforeEach, expect, it, vi } from "vitest"
const storage = vi.hoisted(() => new Map<string, unknown>())
vi.mock("@/utils/storage", () => ({ localStg: { get: (key: string) => storage.get(key) ?? null } }))
import { getAuthSession, recordTokenRotation } from "@/service/request/auth-session"
beforeEach(() => {
  storage.clear()
  storage.set("token", "admin")
  storage.set("refreshToken", "refresh")
})

it("changes generation on every simulated session and restore", () => {
  const normal = getAuthSession()
  storage.delete("refreshToken")
  storage.set("impersonation", { sessionId: "one" })
  expect(getAuthSession()).toBe(normal + 1)
  storage.set("impersonation", { sessionId: "two" })
  expect(getAuthSession()).toBe(normal + 2)
  storage.delete("impersonation")
  storage.set("refreshToken", "refresh")
  expect(getAuthSession()).toBe(normal + 3)
})

it("preserves generation for accepted normal rotation", () => {
  const before = getAuthSession()
  storage.set("token", "new-access")
  storage.set("refreshToken", "new-refresh")
  recordTokenRotation("new-refresh")
  expect(getAuthSession()).toBe(before)
})

it("detects replacement when normal credentials have no refresh token", () => {
  storage.delete("refreshToken")
  const before = getAuthSession()
  storage.set("token", "different")
  expect(getAuthSession()).toBe(before + 1)
})
