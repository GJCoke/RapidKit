import assert from "node:assert/strict"
import test from "node:test"
import { getClosableTabKeys, getFocusKeyAfterClose, getTabKeyboardAction, getTabKeyForNavigation } from "./page-tabs"

const tabs = [{ key: "home", closable: false }, { key: "users" }, { key: "roles", closable: true }]

test("getClosableTabKeys excludes fixed tabs", () => {
  assert.deepEqual(getClosableTabKeys(tabs), ["users", "roles"])
})

test("getClosableTabKeys keeps the contextual tab when closing others", () => {
  assert.deepEqual(getClosableTabKeys(tabs, "users"), ["roles"])
  assert.deepEqual(getClosableTabKeys(tabs, "home"), ["users", "roles"])
})

test("getTabKeyForNavigation wraps arrow focus and supports Home and End", () => {
  assert.equal(getTabKeyForNavigation(tabs, "home", "ArrowLeft"), "roles")
  assert.equal(getTabKeyForNavigation(tabs, "roles", "ArrowRight"), "home")
  assert.equal(getTabKeyForNavigation(tabs, "roles", "Home"), "home")
  assert.equal(getTabKeyForNavigation(tabs, "home", "End"), "roles")
  assert.equal(getTabKeyForNavigation(tabs, "users", "Enter"), null)
})

test("getFocusKeyAfterClose chooses the adjacent surviving tab", () => {
  assert.equal(getFocusKeyAfterClose(tabs, ["users"], "users"), "roles")
  assert.equal(getFocusKeyAfterClose(tabs, ["roles"], "roles"), "users")
  assert.equal(getFocusKeyAfterClose(tabs, ["users", "roles"], "roles"), "home")
  assert.equal(getFocusKeyAfterClose(tabs, ["roles"], "home"), "home")
})

test("getTabKeyboardAction activates tabs, opens the context menu, and leaves unrelated keys alone", () => {
  assert.deepEqual(getTabKeyboardAction(tabs, "users", "Enter"), { type: "activate" })
  assert.deepEqual(getTabKeyboardAction(tabs, "users", " "), { type: "activate" })
  assert.deepEqual(getTabKeyboardAction(tabs, "users", "ContextMenu"), { type: "context" })
  assert.deepEqual(getTabKeyboardAction(tabs, "users", "F10", true), { type: "context" })
  assert.deepEqual(getTabKeyboardAction(tabs, "users", "ArrowRight"), { type: "focus", key: "roles" })
  assert.equal(getTabKeyboardAction(tabs, "users", "Tab"), null)
  assert.equal(getTabKeyboardAction(tabs, "users", "a"), null)
})
