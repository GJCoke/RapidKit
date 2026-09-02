import assert from "node:assert/strict"
import test from "node:test"
import type { MenuItem } from "@/stores/route"

const storage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
}
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage })
Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: storage } })

const system: MenuItem = {
  key: "system",
  path: "/system",
  title: "System",
  order: 0,
  hideInMenu: false,
}
const users: MenuItem = {
  key: "users",
  path: "/system/users",
  title: "Users",
  order: 0,
  hideInMenu: false,
}

test("breadcrumb trail follows matching pathname prefixes in order", async () => {
  const { buildBreadcrumbTrail } = await import("./breadcrumbs")
  const flat = { "/system": system, "/system/users": users }

  assert.deepEqual(buildBreadcrumbTrail("/system/users", flat), [system, users])
  assert.deepEqual(buildBreadcrumbTrail("/unknown", flat), [])
})

test("user initial prefers real name, then username, then a safe fallback", async () => {
  const { getUserInitial } = await import("./user-menu")
  assert.equal(getUserInitial({ realName: "Alice", userName: "admin" }), "A")
  assert.equal(getUserInitial({ realName: "", userName: "admin" }), "A")
  assert.equal(getUserInitial(null), "U")
})

test("navigation trigger opens mobile navigation or toggles the desktop sidebar", async () => {
  const { handleNavigationToggle } = await import("./header")
  const events: string[] = []
  const openMobile = (open: boolean) => events.push(`mobile:${open}`)
  const toggleSidebar = () => events.push("sidebar")

  handleNavigationToggle(true, openMobile, toggleSidebar)
  handleNavigationToggle(false, openMobile, toggleSidebar)

  assert.deepEqual(events, ["mobile:true", "sidebar"])
})
