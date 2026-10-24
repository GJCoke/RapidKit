import { expect, test } from "vitest"
import { canImpersonateUser, canResetUserPassword } from "@/views/manage/user/modules/user-eligibility"
const admin = { id: "admin", isAdmin: true },
  user = { id: "user", isAdmin: false, status: "1" }
test("impersonation permits only an administrator acting as an active other non-admin with no existing impersonation", () => {
  expect(canImpersonateUser(admin, user, false)).toBe(true)
  expect(canImpersonateUser(admin, user, true)).toBe(false)
  expect(canImpersonateUser(admin, { ...user, id: "admin" }, false)).toBe(false)
  expect(canImpersonateUser(admin, { ...user, isAdmin: true }, false)).toBe(false)
  expect(canImpersonateUser(admin, { ...user, status: "2" }, false)).toBe(false)
  expect(canImpersonateUser({ ...admin, isAdmin: false }, user, false)).toBe(false)
  expect(canImpersonateUser({ ...admin, id: "" }, user, false)).toBe(false)
})
test("password reset eligibility is self or administrator and unavailable during impersonation", () => {
  expect(canResetUserPassword(admin, user.id, false)).toBe(true)
  expect(canResetUserPassword(user, user.id, false)).toBe(true)
  expect(canResetUserPassword(user, "other", false)).toBe(false)
  expect(canResetUserPassword(admin, user.id, true)).toBe(false)
})
