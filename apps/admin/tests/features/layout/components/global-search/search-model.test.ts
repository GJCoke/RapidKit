import assert from "node:assert/strict"
import { test } from "vitest"

import { normalizeRoutes } from "@/features/router/route-model"
import { buildRouteSearchIndex, searchRoutes } from "@/features/layout/components/global-search/search-model"

const snapshot = normalizeRoutes([
  {
    name: "system",
    path: "/system",
    component: "layout.base",
    meta: { title: "System", order: 0 },
    children: [
      {
        name: "users",
        path: "users",
        component: "view.users",
        meta: { title: "Users", i18nKey: "route.users", order: 20 },
      },
      {
        name: "audit",
        path: "audit",
        component: "layout.base$view._builtin_iframe-page",
        meta: { title: "Audit log", i18nKey: "route.audit", href: "https://example.com/audit", order: 10 },
      },
      {
        name: "detail",
        path: "users/:id",
        component: "view.user_detail",
        meta: { title: "User detail", hideInMenu: true, order: 30 },
      },
    ],
  },
  {
    name: "help",
    path: "/help",
    component: "view.help",
    meta: { title: "Help center", order: 5, href: "https://example.com/help" },
  },
])

const translate = (key: string, options?: { defaultValue?: string }) =>
  ({ "route.users": "People", "route.audit": "Audit trail" })[key] ?? options?.defaultValue ?? key

test("builds an order-preserving index of visible internal routes only", () => {
  const index = buildRouteSearchIndex(snapshot, translate)

  assert.deepEqual(index, [
    {
      routeName: "audit",
      path: "/system/audit",
      label: "Audit trail",
      keywords: ["Audit trail", "Audit log", "/system/audit"],
    },
    {
      routeName: "users",
      path: "/system/users",
      label: "People",
      keywords: ["People", "Users", "/system/users"],
    },
  ])
})

test("matches translated titles, original titles, and paths without changing route order", () => {
  const index = buildRouteSearchIndex(snapshot, translate)

  assert.deepEqual(
    searchRoutes(index, "people").map((item) => item.routeName),
    ["users"],
  )
  assert.deepEqual(
    searchRoutes(index, "log").map((item) => item.routeName),
    ["audit"],
  )
  assert.deepEqual(
    searchRoutes(index, "/system").map((item) => item.routeName),
    ["audit", "users"],
  )
})
