import assert from "node:assert/strict"
import { test } from "vitest"

import { normalizeRoutes } from "@/features/router/route-model"
import { createTabFromLocation, getRouteInstanceKey } from "@/features/router/route-instance-key"

const snapshot = normalizeRoutes([
  { name: "users", path: "/users", component: "view.users", meta: { title: "Users" } },
  {
    name: "user_report",
    path: "/report",
    component: "view.report",
    meta: { title: "Report", multiTab: true, keepAlive: true, fixedIndexInTab: 2 },
  },
])

test("shares normal route instances and separates multi-tab canonical urls", () => {
  assert.equal(getRouteInstanceKey(snapshot.byName.users!, "/users?page=1"), "route:users")
  assert.equal(
    getRouteInstanceKey(snapshot.byName.user_report!, "/report?b=2&a=1"),
    "route:user_report:/report?a=1&b=2",
  )
  assert.equal(
    getRouteInstanceKey(snapshot.byName.user_report!, "/report?a=1&b=2#details"),
    "route:user_report:/report?a=1&b=2",
  )
})

test("creates tabs from normalized route metadata", () => {
  assert.deepEqual(createTabFromLocation(snapshot.byName.user_report!, "/report?user=1"), {
    key: "route:user_report:/report?user=1",
    routeName: "user_report",
    label: "Report",
    path: "/report?user=1",
    fixedIndex: 2,
    closable: false,
  })
})
