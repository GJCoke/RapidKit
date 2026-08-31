import assert from "node:assert/strict"
import test from "node:test"
import { shouldRedirectLoggedInUserFromLogin } from "./login-redirect"

test("keeps set-password accessible to logged-in users", () => {
  assert.equal(shouldRedirectLoggedInUserFromLogin("set-password", true), false)
})

test("keeps reset-password accessible to logged-in users", () => {
  assert.equal(shouldRedirectLoggedInUserFromLogin("reset-password", true), false)
})

test("redirects logged-in users away from regular login modules", () => {
  assert.equal(shouldRedirectLoggedInUserFromLogin("pwd-login", true), true)
})

test("does not redirect logged-out users from login modules", () => {
  assert.equal(shouldRedirectLoggedInUserFromLogin("pwd-login", false), false)
})
