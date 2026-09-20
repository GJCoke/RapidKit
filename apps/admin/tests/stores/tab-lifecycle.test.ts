import assert from "node:assert/strict"
import { test } from "vitest"

import { normalizeRoutes } from "@/features/router/route-model"
import { resolveAuthorizedTabState } from "@/stores/tab"

const snapshot = normalizeRoutes([
  { name: "home", path: "/home", component: "view.home", meta: { title: "Home" } },
  { name: "users", path: "/users", component: "view.users", meta: { title: "Users" } },
  {
    name: "report",
    path: "/report",
    component: "view.report",
    meta: { title: "Report", multiTab: true, fixedIndexInTab: 2 },
  },
  { name: "docs", path: "/docs", component: "view.docs", meta: { title: "Docs", href: "https://example.com" } },
])

test("reconciles persisted tabs against authorization and route metadata", () => {
  const result = resolveAuthorizedTabState(
    [
      { key: "route:users", routeName: "users", label: "Old", path: "/users", closable: true },
      { key: "route:missing", routeName: "missing", label: "Missing", path: "/missing", closable: true },
      {
        key: "route:report:/report?user=1",
        routeName: "report",
        label: "Old report",
        path: "/report?user=1",
        closable: true,
      },
    ],
    "route:missing",
    snapshot,
    "home",
  )

  assert.deepEqual(
    result.tabs.map((tab) => tab.key),
    ["route:home", "route:report:/report?user=1", "route:users"],
  )
  assert.equal(result.tabs[0]?.closable, false)
  assert.equal(result.tabs[1]?.fixedIndex, 2)
  assert.equal(result.tabs[1]?.closable, false)
  assert.equal(result.activeKey, "route:home")
})

test("does not restore external routes as tabs", () => {
  const result = resolveAuthorizedTabState(
    [{ key: "route:docs", routeName: "docs", label: "Docs", path: "/docs", closable: true }],
    "route:docs",
    snapshot,
    "home",
  )
  assert.deepEqual(
    result.tabs.map((tab) => tab.routeName),
    ["home"],
  )
})
