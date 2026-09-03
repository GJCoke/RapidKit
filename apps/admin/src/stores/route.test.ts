import assert from "node:assert/strict"
import test from "node:test"
import type { TFunction } from "i18next"
import { getMenuLabel } from "@/features/layout/components/menu-label"
import { useRouteStore } from "./route"

test("route store retains backend i18n keys and labels translate at render time", () => {
  useRouteStore.getState().setRoutes([{ name: "home", path: "/home", meta: { title: "首页", i18nKey: "route.home" } }])
  const item = useRouteStore.getState().flat["/home"]
  assert.equal(item.i18nKey, "route.home")
  assert.equal(getMenuLabel(item, ((key: string) => (key === "route.home" ? "Home" : key)) as TFunction), "Home")
  assert.equal(getMenuLabel({ title: "Fallback" }, ((key: string) => key) as TFunction), "Fallback")
})
