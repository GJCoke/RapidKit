import assert from "node:assert/strict"
import { test } from "vitest"

import type { BackendRoute } from "@/services/api/route"
import { normalizeRoutes } from "@/features/router/route-model"
import { resolveAuthorizedTabState } from "@/stores/tab"

const routes: BackendRoute[] = [
  {
    name: "system",
    path: "/manage",
    children: [
      {
        name: "user",
        path: "/manage/user",
        meta: { title: "用户管理", icon: "lucide:users", localIcon: "users" },
      },
      { name: "role", path: "/manage/role", meta: { title: "角色管理" } },
    ],
  },
]

test("authorized tab state uses the backend home instead of inventing /home", () => {
  assert.deepEqual(resolveAuthorizedTabState([], "", normalizeRoutes(routes), "user"), {
    tabs: [
      {
        key: "route:user",
        routeName: "user",
        label: "用户管理",
        path: "/manage/user",
        icon: "lucide:users",
        localIcon: "users",
        fixedIndex: -1,
        closable: false,
      },
    ],
    activeKey: "route:user",
  })
})

test("authorized tab state removes persisted tabs that are no longer authorized", () => {
  assert.deepEqual(
    resolveAuthorizedTabState(
      [
        { key: "route:user", routeName: "user", label: "旧用户标签", path: "/manage/user", closable: false },
        { key: "route:audit", routeName: "audit", label: "审计日志", path: "/manage/audit", closable: true },
        { key: "route:role", routeName: "role", label: "角色管理", path: "/manage/role", closable: true },
      ],
      "audit",
      normalizeRoutes(routes),
      "user",
    ),
    {
      tabs: [
        {
          key: "route:user",
          routeName: "user",
          label: "用户管理",
          path: "/manage/user",
          icon: "lucide:users",
          localIcon: "users",
          fixedIndex: -1,
          closable: false,
        },
        { key: "route:role", routeName: "role", label: "角色管理", path: "/manage/role", closable: true },
      ],
      activeKey: "route:user",
    },
  )
})
