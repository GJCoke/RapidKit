import assert from "node:assert/strict"
import { test } from "vitest"
import type { TFunction } from "i18next"
import { getMenuLabel } from "@/features/layout/components/menu-label"
import { normalizeRoutes } from "@/features/router/route-model"
import { useRouteStore } from "@/stores/route"

test("route store retains backend i18n keys and labels translate at render time", () => {
  useRouteStore.getState().replaceSnapshot(
    normalizeRoutes([
      {
        name: "home",
        path: "/home",
        meta: {
          title: "首页",
          i18nKey: "route.home",
          icon: "lucide:house",
          localIcon: "home",
          activeMenu: "manage_user",
        },
      },
    ]),
  )
  const item = useRouteStore.getState().flat["/home"]
  assert.equal(item.i18nKey, "route.home")
  assert.equal(item.icon, "lucide:house")
  assert.equal(item.localIcon, "home")
  assert.equal(item.activeMenu, "manage_user")
  assert.equal(getMenuLabel(item, ((key: string) => (key === "route.home" ? "Home" : key)) as TFunction), "Home")
  assert.equal(getMenuLabel({ title: "Fallback" }, ((key: string) => key) as TFunction), "Fallback")
})

test("route store derives visible menus and indexes from one snapshot", () => {
  const snapshot = normalizeRoutes([
    { name: "home", path: "/home", component: "view.home", meta: { title: "Home" } },
    {
      name: "detail",
      path: "/detail",
      component: "view.detail",
      meta: { title: "Detail", hideInMenu: true },
    },
  ])

  useRouteStoreIsNotRequired()
  useRouteStore.getState().replaceSnapshot(snapshot)
  const state = useRouteStore.getState()
  assert.equal(state.snapshot, snapshot)
  assert.equal(state.menus.length, 1)
  assert.equal(state.flat["/detail"]?.key, "detail")
  assert.equal(state.revision > 0, true)
})

function useRouteStoreIsNotRequired() {
  useRouteStore.getState().clearRoutes()
}
