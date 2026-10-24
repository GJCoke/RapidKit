import { expect, test } from "vitest"
import type { BackendRoute } from "@/services/api/route"
import { withBuiltinRoutes } from "@/features/router/builtin-routes"
import { findFirstNavigablePath, normalizeRoutes } from "@/features/router/route-model"
import { resolveAuthorizedHomePath } from "@/features/router/generate-routes"
import { reconcileRouteRuntime } from "@/features/router/route-reconcile"
import { resolveAuthorizedTabState } from "@/stores/tab"
import { createTabFromLocation } from "@/features/router/route-instance-key"

const home: BackendRoute = { name: "home", path: "/home", component: "view.home", meta: { title: "Home" } }

test("adds the public hidden cached parameterized iframe without mutating backend menus", () => {
  const original = [home]
  const routes = withBuiltinRoutes(original)
  expect(original).toEqual([home])
  const iframe = normalizeRoutes(routes).byName["iframe-page"]
  expect(iframe?.kind).toBe("iframe")
  expect(iframe?.fullPath).toBe("/iframe-page/:url")
  expect(iframe?.hideInMenu).toBe(true)
  expect(iframe?.keepAlive).toBe(true)
  expect(iframe?.multiTab).toBe(true)
  expect(routes.find((route) => route.name === "iframe-page")?.meta?.constant).toBe(true)
  expect(withBuiltinRoutes(routes)).toBe(routes)
})

test.each([
  { name: "iframe-page", path: "/custom-embed", component: "view.custom" },
  { name: "custom-embed", path: "/iframe-page/:url", component: "view.custom" },
])("does not override an existing backend iframe name or path: $name", (existing) => {
  const original: BackendRoute[] = [{ name: "group", path: "/", children: [existing] }]
  expect(withBuiltinRoutes(original)).toBe(original)
})

test.each([
  "view.iframe-page",
  "layout.base$view.iframe-page",
  "view._builtin_iframe-page",
  "layout.base$view._builtin_iframe-page",
])("recognizes the actual iframe component grammar %s", (component) =>
  expect(normalizeRoutes([{ name: "frame", path: "/embed", component }]).byName.frame?.kind).toBe("iframe"),
)

test("an unresolved built-in parameter cannot become a home or a fixed page tab", () => {
  const snapshot = normalizeRoutes(withBuiltinRoutes([]))
  expect(findFirstNavigablePath(snapshot.tree)).toBeUndefined()
  expect(resolveAuthorizedHomePath(snapshot, "iframe-page")).toBe("/404")
  expect(
    reconcileRouteRuntime({ snapshot, homeName: "iframe-page", currentPathname: "/missing", tabs: [] }).nextPath,
  ).toBe("/404")
  expect(resolveAuthorizedTabState([], "", snapshot, "iframe-page").tabs).toEqual([])
  const ready = normalizeRoutes(withBuiltinRoutes([home]))
  expect(resolveAuthorizedHomePath(ready, "iframe-page")).toBe("/home")
})

test("different encoded iframe URLs have isolated tabs and cached instance keys", () => {
  const snapshot = normalizeRoutes(withBuiltinRoutes([home]))
  const iframe = snapshot.byName["iframe-page"]!
  const a = createTabFromLocation(iframe, `/iframe-page/${encodeURIComponent("https://example.com/a?q=%2Fkeep")}`)
  const b = createTabFromLocation(iframe, `/iframe-page/${encodeURIComponent("https://example.com/b")}`)
  expect(a.key).not.toBe(b.key)
  expect(a.path).toContain("%252Fkeep")
  expect(a.closable).toBe(true)
})
