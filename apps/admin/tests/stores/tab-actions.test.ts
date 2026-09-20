import assert from "node:assert/strict"
import { beforeEach, test } from "vitest"

import { normalizeRoutes } from "@/features/router/route-model"

import { resolveAuthorizedTabState, useTabStore, type Tab } from "@/stores/tab"

const tabs: Tab[] = [
  { key: "home", routeName: "home", label: "Home", path: "/home", fixedIndex: -1, closable: false },
  { key: "reports", routeName: "reports", label: "Reports", path: "/reports", fixedIndex: 1, closable: false },
  { key: "users", routeName: "users", label: "Users", path: "/users", closable: true },
  { key: "roles", routeName: "roles", label: "Roles", path: "/roles", closable: true },
  { key: "audit", routeName: "audit", label: "Audit", path: "/audit", closable: true },
]

function tabKeys() {
  return useTabStore.getState().tabs.map((tab) => tab.key)
}

beforeEach(() => {
  useTabStore.setState({ tabs: structuredClone(tabs), activeKey: "users" })
})

test("closeLeftOf removes only closable tabs before the contextual tab and returns their cache keys", () => {
  const removed = useTabStore.getState().closeLeftOf("audit")

  assert.deepEqual(removed, ["users", "roles"])
  assert.deepEqual(tabKeys(), ["home", "reports", "audit"])
})

test("closeRightOf removes only closable tabs after the contextual tab and returns their cache keys", () => {
  const removed = useTabStore.getState().closeRightOf("users")

  assert.deepEqual(removed, ["roles", "audit"])
  assert.deepEqual(tabKeys(), ["home", "reports", "users"])
})

test("pinTab keeps user-pinned tabs after system-fixed tabs", () => {
  useTabStore.getState().pinTab("audit")
  useTabStore.getState().pinTab("users")

  assert.deepEqual(tabKeys(), ["home", "reports", "audit", "users", "roles"])
  assert.equal(useTabStore.getState().tabs[2]?.pinned, true)
})

test("unpinTab returns a user-pinned tab to the ordinary tab order", () => {
  useTabStore.setState({
    tabs: tabs.map((tab) => (tab.key === "users" ? { ...tab, pinned: true } : tab)),
  })

  useTabStore.getState().unpinTab("users")

  assert.deepEqual(tabKeys(), ["home", "reports", "users", "roles", "audit"])
  assert.equal(useTabStore.getState().tabs[2]?.pinned, undefined)
})

test("user-pinned tabs survive every close path while other requested tabs are removed", () => {
  useTabStore.getState().pinTab("users")

  assert.deepEqual(useTabStore.getState().removeTab("users"), [])
  assert.deepEqual(useTabStore.getState().removeTabs(["users", "roles", "audit"]), ["roles", "audit"])
  assert.deepEqual(tabKeys(), ["home", "reports", "users"])

  useTabStore.setState({ tabs: structuredClone(tabs), activeKey: "users" })
  useTabStore.getState().pinTab("users")
  assert.deepEqual(useTabStore.getState().closeLeftOf("audit"), ["roles"])
  assert.deepEqual(tabKeys(), ["home", "reports", "users", "audit"])

  useTabStore.setState({ tabs: structuredClone(tabs), activeKey: "users" })
  useTabStore.getState().pinTab("users")
  assert.deepEqual(useTabStore.getState().closeRightOf("home"), ["roles", "audit"])
  assert.deepEqual(tabKeys(), ["home", "reports", "users"])
})

test("system-fixed and home tabs cannot be unpinned or removed by batch operations", () => {
  useTabStore.getState().unpinTab("home")
  useTabStore.getState().unpinTab("reports")
  const removed = useTabStore.getState().removeTabs(["home", "reports"])

  assert.deepEqual(removed, [])
  assert.deepEqual(tabKeys(), ["home", "reports", "users", "roles", "audit"])
})

test("removing the active tab activates the adjacent surviving tab", () => {
  useTabStore.setState({ activeKey: "roles" })

  const removed = useTabStore.getState().closeRightOf("users")

  assert.deepEqual(removed, ["roles", "audit"])
  assert.equal(useTabStore.getState().activeKey, "users")
})

test("authorization reconciliation retains a user pin after restoring persisted tabs", () => {
  const snapshot = normalizeRoutes([
    { name: "home", path: "/home", component: "view.home", meta: { title: "Home" } },
    { name: "users", path: "/users", component: "view.users", meta: { title: "Users" } },
  ])

  const result = resolveAuthorizedTabState(
    [{ key: "route:users", routeName: "users", label: "Users", path: "/users", closable: true, pinned: true }],
    "route:users",
    snapshot,
    "home",
  )

  assert.equal(result.tabs.find((tab) => tab.key === "route:users")?.pinned, true)
})
