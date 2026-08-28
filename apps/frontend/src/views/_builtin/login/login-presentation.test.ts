import assert from "node:assert/strict"
import test from "node:test"
import { getLoginPresentation } from "./login-presentation"

test("uses the activation presentation for set-password", () => {
  assert.deepEqual(getLoginPresentation("set-password"), {
    mode: "activation",
    showModuleTitle: false,
  })
})

test("keeps the default presentation for regular login modules", () => {
  assert.deepEqual(getLoginPresentation("pwd-login"), {
    mode: "default",
    showModuleTitle: true,
  })
})
