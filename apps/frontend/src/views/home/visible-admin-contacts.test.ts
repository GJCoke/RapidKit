import assert from "node:assert/strict"
import test from "node:test"
import { visibleAdminContacts } from "./visible-admin-contacts"

test("shows the first three contacts while collapsed", () => {
  assert.deepEqual(visibleAdminContacts([1, 2, 3, 4], false), [1, 2, 3])
})

test("shows every contact while expanded", () => {
  assert.deepEqual(visibleAdminContacts([1, 2, 3, 4], true), [1, 2, 3, 4])
})
