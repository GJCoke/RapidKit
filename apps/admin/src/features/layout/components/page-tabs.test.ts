import assert from "node:assert/strict"
import test from "node:test"
import { getClosableTabKeys } from "./page-tabs"

const tabs = [{ key: "home", closable: false }, { key: "users" }, { key: "roles", closable: true }]

test("getClosableTabKeys excludes fixed tabs", () => {
  assert.deepEqual(getClosableTabKeys(tabs), ["users", "roles"])
})

test("getClosableTabKeys keeps the contextual tab when closing others", () => {
  assert.deepEqual(getClosableTabKeys(tabs, "users"), ["roles"])
  assert.deepEqual(getClosableTabKeys(tabs, "home"), ["users", "roles"])
})
