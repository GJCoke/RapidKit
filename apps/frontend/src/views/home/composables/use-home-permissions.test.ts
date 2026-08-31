import assert from "node:assert/strict"
import test from "node:test"
import { resolvePermissionState } from "../home-permission-state"

test("uses restricted state when no allowed key exists locally", () => {
  assert.equal(resolvePermissionState(["dashboard.business"], ["plugin.unknown"]), "restricted")
})

test("uses dashboard state when an allowed key exists locally", () => {
  assert.equal(
    resolvePermissionState(["dashboard.business", "dashboard.trends"], ["dashboard.trends"]),
    "dashboard",
  )
})
