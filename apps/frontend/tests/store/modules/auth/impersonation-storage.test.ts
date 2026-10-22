import { beforeEach, describe, expect, it, vi } from "vitest"

const storage = vi.hoisted(() => new Map<string, unknown>())
vi.mock("@/utils/storage", () => ({
  localStg: {
    get: (key: string) => storage.get(key) ?? null,
    set: (key: string, value: unknown) => storage.set(key, value),
    remove: (key: string) => storage.delete(key),
  },
}))
import { beginImpersonationStorage, restoreImpersonatorStorage } from "@/store/modules/auth/impersonation-storage"

const created = {
  accessToken: "simulated",
  sessionId: "sid",
  subject: { id: "user", name: "User", username: "user1" },
  expiresAt: "2099-01-01T00:00:00Z",
}

beforeEach(() => {
  storage.clear()
  storage.set("token", "admin")
  storage.set("refreshToken", "admin-refresh")
})

describe("administrator credential backup", () => {
  it("backs up credentials and restores them exactly once", () => {
    beginImpersonationStorage(created, "/manage/user")
    expect(storage.get("token")).toBe("simulated")
    expect(storage.has("refreshToken")).toBe(false)
    expect(storage.get("impersonatorToken")).toBe("admin")
    expect(storage.get("impersonatorRefreshToken")).toBe("admin-refresh")
    expect(restoreImpersonatorStorage()).toBe("/manage/user")
    expect(storage.get("token")).toBe("admin")
    expect(storage.get("refreshToken")).toBe("admin-refresh")
    expect([...storage.keys()]).toEqual(["token", "refreshToken"])
    expect(restoreImpersonatorStorage()).toBeNull()
    expect(storage.get("token")).toBe("admin")
  })

  it("rejects nested entry and missing administrator credentials without overwriting backups", () => {
    beginImpersonationStorage(created, "/")
    expect(() => beginImpersonationStorage(created, "/other")).toThrow()
    expect(storage.get("impersonatorToken")).toBe("admin")
    storage.clear()
    expect(() => beginImpersonationStorage(created, "/")).toThrow()
    expect(storage.size).toBe(0)
  })

  it("clears simulated credentials when the administrator backup is missing", () => {
    beginImpersonationStorage(created, "/")
    storage.delete("impersonatorToken")
    expect(restoreImpersonatorStorage()).toBe("/")
    expect(storage.size).toBe(0)
  })

  it("restores an interrupted backup without impersonation metadata", () => {
    storage.set("impersonatorToken", "original")
    storage.set("impersonatorReturnPath", "/manage/user")
    expect(restoreImpersonatorStorage()).toBe("/manage/user")
    expect(storage.get("token")).toBe("original")
  })
})
