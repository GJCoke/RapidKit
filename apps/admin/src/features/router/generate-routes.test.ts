import assert from "node:assert/strict"
import test from "node:test"
import { matchRoutes } from "react-router"
import type { BackendRoute, UserRouteResponse } from "@/services/api/route"
import { generateRoutes, resolveAuthorizedHomePath } from "./generate-routes"
import { parseBackendComponent } from "./lazy-import"

const payload: UserRouteResponse = {
  home: "manage_user",
  routes: [
    { name: "home", path: "/home", component: "layout.base$view.home", meta: { title: "Home", i18nKey: "route.home" } },
    {
      name: "manage",
      path: "/manage",
      component: "layout.base",
      meta: { title: "System", i18nKey: "route.manage" },
      children: [
        { name: "manage_user", path: "/manage/user", component: "view.manage_user", meta: { title: "Users", i18nKey: "route.manage_user" } },
      ],
    },
  ],
}

test("backend component grammar maps views and keeps layout directories renderable", () => {
  assert.deepEqual(parseBackendComponent("view.manage_user"), { kind: "view", viewPath: "manage/user" })
  assert.deepEqual(parseBackendComponent("layout.base$view.home"), { kind: "view", viewPath: "home" })
  assert.deepEqual(parseBackendComponent("layout.base"), { kind: "container" })

  const matches = matchRoutes(generateRoutes(payload.routes), "/manage/user")
  assert.deepEqual(matches?.map((match) => match.route.path), ["/manage", "/manage/user"])
  assert.ok(matches?.every((match) => match.route.element), "both directory and leaf must render")
})

test("authorized home resolves the backend route name and never invents /home", () => {
  assert.equal(resolveAuthorizedHomePath(payload), "/manage/user")
  assert.equal(resolveAuthorizedHomePath({ home: "home", routes: [] }), "/404")
  const routesWithoutHome: BackendRoute[] = [
    { name: "reports", path: "/reports", component: "view.reports", meta: { title: "Reports" } },
  ]
  assert.equal(resolveAuthorizedHomePath({ home: "missing", routes: routesWithoutHome }), "/reports")
})
