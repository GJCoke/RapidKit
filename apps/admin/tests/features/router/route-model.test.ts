import assert from "node:assert/strict"
import { test } from "vitest"

import { findRouteForPath, normalizeRoutes } from "@/features/router/route-model"

test("normalizes backend routes into one indexed snapshot", () => {
  const snapshot = normalizeRoutes([
    {
      name: "manage",
      path: "/manage",
      component: "layout.base",
      meta: { title: "Manage" },
      children: [
        {
          name: "manage_user",
          path: "user",
          component: "view.manage_user",
          meta: {
            title: "Users",
            keepAlive: true,
            multiTab: true,
            fixedIndexInTab: 2,
            query: [{ key: "page", value: "1" }],
          },
        },
      ],
    },
    {
      name: "docs",
      path: "/docs",
      component: "view.docs",
      meta: { title: "Docs", href: "https://example.com/docs" },
    },
    {
      name: "embedded_docs",
      path: "/embedded-docs",
      component: "layout.base$view._builtin_iframe-page",
      meta: { title: "Embedded docs", href: "https://example.com/embed" },
    },
  ])

  assert.equal(snapshot.tree[0]?.kind, "layout")
  assert.equal(snapshot.byName.manage_user?.fullPath, "/manage/user")
  assert.equal(snapshot.byName.manage_user?.defaultSearch, "?page=1")
  assert.equal(snapshot.byName.manage_user?.keepAlive, true)
  assert.equal(snapshot.byName.manage_user?.multiTab, true)
  assert.equal(snapshot.byName.manage_user?.fixedIndexInTab, 2)
  assert.equal(snapshot.byPath["/manage/user"]?.name, "manage_user")
  assert.equal(snapshot.byName.docs?.kind, "external")
  assert.equal(snapshot.byName.embedded_docs?.kind, "iframe")
  assert.equal(snapshot.diagnostics.length, 0)
})

test("finds parameterized routes for concrete browser paths", () => {
  const snapshot = normalizeRoutes([
    { name: "user_detail", path: "/users/:id", component: "view.users_detail", meta: { title: "Detail" } },
  ])
  assert.equal(findRouteForPath(snapshot, "/users/42")?.name, "user_detail")
  assert.equal(findRouteForPath(snapshot, "/missing"), undefined)
})

test("reports duplicates and rejects unsafe external urls", () => {
  const snapshot = normalizeRoutes([
    { name: "one", path: "/same", component: "view.one", meta: { title: "One" } },
    { name: "one", path: "/other", component: "view.two", meta: { title: "Duplicate name" } },
    { name: "three", path: "/same", component: "view.three", meta: { title: "Duplicate path" } },
    {
      name: "unsafe",
      path: "/unsafe",
      component: "view.unsafe",
      meta: { title: "Unsafe", href: "javascript:alert(1)" },
    },
  ])

  assert.equal(snapshot.byName.one?.fullPath, "/same")
  assert.equal(snapshot.byName.unsafe?.href, undefined)
  assert.equal(snapshot.byName.unsafe?.kind, "view")
  assert.deepEqual(
    snapshot.diagnostics.map((item) => item.code),
    ["duplicate-name", "duplicate-path", "unsafe-href"],
  )
})
