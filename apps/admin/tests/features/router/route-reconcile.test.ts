import assert from "node:assert/strict"
import { test } from "vitest"

import { normalizeRoutes } from "@/features/router/route-model"
import { reconcileRouteRuntime } from "@/features/router/route-reconcile"

const snapshot = normalizeRoutes([
  { name: "home", path: "/home", component: "view.home", meta: { title: "Home" } },
  { name: "users", path: "/users", component: "view.users", meta: { title: "Users", keepAlive: true } },
])

test("keeps an authorized current route and filters runtime instance keys", () => {
  const result = reconcileRouteRuntime({
    snapshot,
    homeName: "home",
    currentPathname: "/users",
    currentPathSearch: "/users",
    tabs: [
      { key: "route:users", routeName: "users", path: "/users" },
      { key: "route:removed", routeName: "removed", path: "/removed" },
    ],
  })
  assert.equal(result.nextPath, null)
  assert.deepEqual([...result.validTabKeys], ["route:users"])
  assert.deepEqual([...result.validCacheKeys], ["route:users"])
})

test("keeps the active cache before the page tab effect registers it", () => {
  const result = reconcileRouteRuntime({
    snapshot,
    homeName: "home",
    currentPathname: "/users",
    currentPathSearch: "/users?page=1",
    tabs: [],
  })
  assert.deepEqual([...result.validCacheKeys], ["route:users"])
})

test("redirects a removed current route to the authorized home", () => {
  const result = reconcileRouteRuntime({
    snapshot,
    homeName: "home",
    currentPathname: "/removed",
    currentPathSearch: "/removed",
    tabs: [],
  })
  assert.equal(result.nextPath, "/home")
})

test("falls back to 404 when no navigable route remains", () => {
  const result = reconcileRouteRuntime({
    snapshot: normalizeRoutes([]),
    homeName: "home",
    currentPathname: "/removed",
    currentPathSearch: "/removed",
    tabs: [],
  })
  assert.equal(result.nextPath, "/404")
})
