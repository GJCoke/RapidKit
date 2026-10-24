// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest"
import {
  beginImpersonation,
  clearIdentityStorage,
  getCredentials,
  readImpersonation,
  restoreImpersonator,
} from "@/features/auth/impersonation-storage"

const created = {
  sessionId: "session-1",
  accessToken: "subject-access",
  expiresAt: "2099-01-01T00:00:00Z",
  subject: { id: "subject-1", name: "Subject", username: "subject" },
}
afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})
function actor() {
  localStorage.setItem("accessToken", "actor-access")
  localStorage.setItem("refreshToken", "actor-refresh")
}
test("every intermediate storage event sees a complete actor or subject credential pair", () => {
  actor()
  const observed: ReturnType<typeof getCredentials>[] = []
  const set = Storage.prototype.setItem
  const remove = Storage.prototype.removeItem
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
    set.call(this, key, value)
    observed.push(getCredentials())
  })
  vi.spyOn(Storage.prototype, "removeItem").mockImplementation(function (this: Storage, key) {
    remove.call(this, key)
    observed.push(getCredentials())
  })
  beginImpersonation(created, "/manage/user?status=1")
  expect(readImpersonation()).toEqual(created)
  expect(getCredentials()).toEqual({ accessToken: "subject-access", refreshToken: "" })
  expect(restoreImpersonator()).toBe("/manage/user?status=1")
  expect(getCredentials()).toEqual({ accessToken: "actor-access", refreshToken: "actor-refresh" })
  expect(observed.length).toBeGreaterThan(5)
  for (const pair of observed) {
    expect([
      { accessToken: "actor-access", refreshToken: "actor-refresh" },
      { accessToken: "subject-access", refreshToken: "" },
    ]).toContainEqual(pair)
  }
})
test("nesting is refused without replacing the original administrator backup", () => {
  actor()
  beginImpersonation(created, "/manage/user")
  expect(() => beginImpersonation({ ...created, sessionId: "other" }, "/elsewhere")).toThrow()
  expect(restoreImpersonator()).toBe("/manage/user")
  expect(getCredentials().accessToken).toBe("actor-access")
})
test("an orphan backup restores, malformed subject records cannot expose their refresh token", () => {
  actor()
  beginImpersonation(created, "/manage/user")
  localStorage.removeItem("impersonation")
  expect(restoreImpersonator()).toBe("/manage/user")
  localStorage.setItem("impersonation", "broken")
  expect(getCredentials()).toEqual({ accessToken: "", refreshToken: "" })
  expect(restoreImpersonator()).toBe("/")
  expect(getCredentials()).toEqual({ accessToken: "", refreshToken: "" })
})
test("untrusted return paths fall back home and a manual logout removes both identities", () => {
  for (const path of ["//external.test", "https://external.test", "/\\external", "/bad\npath"]) {
    actor()
    beginImpersonation(created, path)
    expect(restoreImpersonator()).toBe("/")
  }
  actor()
  beginImpersonation(created, "/manage/user")
  clearIdentityStorage()
  expect(localStorage.length).toBe(0)
  expect(restoreImpersonator()).toBeNull()
})
