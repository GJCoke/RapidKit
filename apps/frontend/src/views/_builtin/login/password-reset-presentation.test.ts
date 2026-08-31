import assert from "node:assert/strict"
import test from "node:test"
import { getResetRequestState } from "./password-reset-presentation"

test("keeps request disabled during the cooldown", () => {
  assert.deepEqual(getResetRequestState(true, 60), {
    submitted: true,
    canSubmit: false,
    seconds: 60,
  })
})

test("reenables request after the cooldown", () => {
  assert.deepEqual(getResetRequestState(true, 0), {
    submitted: true,
    canSubmit: true,
    seconds: 0,
  })
})
