import assert from "node:assert/strict"
import { test } from "vitest"
import { matchRoutes } from "react-router"
import type { BackendRoute, UserRouteResponse } from "@/services/api/route"
import { generateRoutes, resolveAuthorizedHomePath } from "@/features/router/generate-routes"
import { findViewModule, parseBackendComponent } from "@/features/router/lazy-import"
import { normalizeRoutes } from "@/features/router/route-model"
import { readFile } from "node:fs/promises"

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
        {
          name: "manage_user",
          path: "/manage/user",
          component: "view.manage_user",
          meta: { title: "Users", i18nKey: "route.manage_user" },
        },
      ],
    },
  ],
}

test("backend component grammar maps views and keeps layout directories loadable", async () => {
  assert.deepEqual(parseBackendComponent("view.manage_user"), { kind: "view", viewPath: "manage/user" })
  assert.deepEqual(parseBackendComponent("layout.base$view.home"), { kind: "view", viewPath: "home" })
  assert.deepEqual(parseBackendComponent("layout.base"), { kind: "container" })

  const snapshot = normalizeRoutes(payload.routes)
  const matches = matchRoutes(generateRoutes(snapshot.tree), "/manage/user")
  assert.deepEqual(
    matches?.map((match) => match.route.path),
    ["/manage", "/manage/user"],
  )
  assert.ok(
    matches?.every((match) => match.route.lazy),
    "both directory and leaf must load through the router",
  )
  assert.ok(
    matches?.every((match) => match.route.element === undefined),
    "lazy routes must not suspend the whole app",
  )

  const loadContainer = matches?.[0]?.route.lazy
  assert.equal(typeof loadContainer, "function")
  if (typeof loadContainer !== "function") throw new TypeError("expected a route lazy loader")

  const containerModule = await loadContainer()
  assert.equal(typeof containerModule?.Component, "function")
})

test("authorized home resolves the backend route name and never invents /home", () => {
  assert.equal(resolveAuthorizedHomePath(normalizeRoutes(payload.routes), payload.home), "/manage/user")
  assert.equal(resolveAuthorizedHomePath(normalizeRoutes([]), "home"), "/404")
  const routesWithoutHome: BackendRoute[] = [
    { name: "reports", path: "/reports", component: "view.reports", meta: { title: "Reports" } },
  ]
  assert.equal(resolveAuthorizedHomePath(normalizeRoutes(routesWithoutHome), "missing"), "/reports")
})

test("external routes render the external handler without loading a local view", () => {
  const [route] = generateRoutes(
    normalizeRoutes([
      {
        name: "docs",
        path: "/docs",
        component: "view.missing",
        meta: { title: "Docs", href: "https://example.com/docs" },
      },
    ]).tree,
  )

  assert.notEqual(route.element, undefined)
  assert.equal(route.lazy, undefined)
})

test("every generated route receives a route error boundary", () => {
  const routes = generateRoutes(normalizeRoutes(payload.routes).tree)
  assert.ok(routes.every((route) => route.errorElement))
  assert.ok(routes.flatMap((route) => route.children ?? []).every((route) => route.errorElement))
})

test("view glob uses a Vite-root path with stable development and production keys", async () => {
  const source = await readFile(new URL("../../../src/features/router/lazy-import.ts", import.meta.url), "utf8")
  assert.match(source, /const pageModules = import\.meta\.glob\("\/src\/views\/\*\*\/index\.tsx"\)/)
  assert.doesNotMatch(source, /import\.meta\.glob\("@\/views/)
})

test("view lookup ignores environment-specific glob key prefixes", () => {
  const load = async () => ({ default: () => null })
  assert.equal(findViewModule({ "/src/views/manage/user/index.tsx": load }, "manage/user"), load)
  assert.equal(findViewModule({ "@/views/manage/user/index.tsx": load }, "manage/user"), load)
  assert.equal(findViewModule({ "../../views/manage/user/index.tsx": load }, "manage/user"), load)
})
