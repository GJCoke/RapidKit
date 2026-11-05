import { beforeEach, expect, it, vi } from "vitest"
const storage = vi.hoisted(() => new Map<string, unknown>())
vi.mock("@/utils/storage", () => ({
  localStg: {
    get: (key: string) => storage.get(key) ?? null,
    set: (key: string, value: unknown) => storage.set(key, value),
  },
}))
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
  recordTokenRotation("new-refresh", "new-access")
  expect(getAuthSession()).toBe(before)
})

it("detects replacement when normal credentials have no refresh token", () => {
  storage.delete("refreshToken")
  const before = getAuthSession()
  storage.set("token", "different")
  expect(getAuthSession()).toBe(before + 1)
})

function accessToken(jti: string, sub = "admin") {
  return `header.${btoa(JSON.stringify({ jti, sub }))}.signature`
}

it("preserves another tab's generation across successive accepted rotations", async () => {
  storage.set("token", accessToken("login"))
  const before = getAuthSession()
  vi.resetModules()
  const otherTab = await import("@/service/request/auth-session")
  const otherBefore = otherTab.getAuthSession()
  for (const id of ["rotation-one", "rotation-two"]) {
    const next = accessToken(id)
    recordTokenRotation(`refresh-${id}`, next)
    storage.set("token", next)
    storage.set("refreshToken", `refresh-${id}`)
    expect(getAuthSession()).toBe(before)
  }
  // A suspended tab can miss multiple rotations and still recognize its login.
  expect(otherTab.getAuthSession()).toBe(otherBefore)
  expect(JSON.stringify(storage.get("tokenRotation"))).not.toContain("signature")
})

it.each(["admin", "another-user"])(
  "treats a new %s login as a different session despite an old rotation record",
  (sub) => {
    storage.set("token", accessToken("login"))
    getAuthSession()
    const next = accessToken("renewed")
    recordTokenRotation("renewed-refresh", next)
    storage.set("token", next)
    storage.set("refreshToken", "renewed-refresh")
    const before = getAuthSession()
    storage.set("token", accessToken("new-login", sub))
    storage.set("refreshToken", "new-login-refresh")
    expect(getAuthSession()).toBe(before + 1)
  },
)

it("keeps another tab's session while rotation metadata precedes the new credentials", async () => {
  storage.set("token", accessToken("login"))
  getAuthSession()
  recordTokenRotation("refresh-one", accessToken("one"))
  storage.set("token", accessToken("one"))
  storage.set("refreshToken", "refresh-one")
  vi.resetModules()
  const otherTab = await import("@/service/request/auth-session")
  const before = otherTab.getAuthSession()
  recordTokenRotation("refresh-two", accessToken("two"))
  expect(otherTab.getAuthSession()).toBe(before)
  storage.set("token", accessToken("two"))
  storage.set("refreshToken", "refresh-two")
  expect(otherTab.getAuthSession()).toBe(before)
})
