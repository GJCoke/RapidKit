import assert from "node:assert/strict"
import test from "node:test"
import { getLoginModulePattern } from "./router-path"

test("login route accepts password reset confirmation module", () => {
  const modulePattern = new RegExp(`^(?:${getLoginModulePattern()})$`)

  assert.equal(modulePattern.test("reset-password"), true)
  assert.equal(modulePattern.test("unknown-module"), false)
})
