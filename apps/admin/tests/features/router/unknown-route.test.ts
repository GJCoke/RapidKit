import assert from "node:assert/strict"
import { test } from "vitest"
import { pathToRouteName, resolveUnknownRouteState } from "@/features/router/unknown-route-state"

test("pathToRouteName follows the backend route naming convention", () => {
  assert.equal(pathToRouteName("/manage/user"), "manage_user")
  assert.equal(pathToRouteName("/manage/data-policy/"), "manage_data-policy")
  assert.equal(pathToRouteName("/"), null)
})

test("unknown route state sends anonymous users to login", () => {
  assert.equal(resolveUnknownRouteState({ token: "", routeName: "manage_user", isLoading: false }), "login")
})

test("unknown route state distinguishes forbidden and missing routes", () => {
  assert.equal(
    resolveUnknownRouteState({ token: "token", routeName: "manage_user", isLoading: false, exists: true }),
    "forbidden",
  )
  assert.equal(
    resolveUnknownRouteState({ token: "token", routeName: "missing", isLoading: false, exists: false }),
    "not-found",
  )
})

test("unknown route state keeps query failures retryable", () => {
  assert.equal(
    resolveUnknownRouteState({ token: "token", routeName: "manage_user", isLoading: false, hasError: true }),
    "error",
  )
  assert.equal(resolveUnknownRouteState({ token: "token", routeName: "manage_user", isLoading: true }), "loading")
})
