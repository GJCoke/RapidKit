import assert from "node:assert/strict"
import test from "node:test"
import type { MenuItem } from "@/stores/route"
import { isActive } from "./sidebar-menu"

function menu(overrides: Partial<MenuItem>): MenuItem {
  return {
    key: "root",
    path: "/root",
    title: "Root",
    order: 0,
    hideInMenu: false,
    ...overrides,
  }
}

test("isActive matches an exact leaf path", () => {
  assert.equal(isActive(menu({ path: "/home" }), "/home"), true)
  assert.equal(isActive(menu({ path: "/home" }), "/home/settings"), false)
})

test("isActive finds an active descendant recursively", () => {
  const item = menu({
    children: [
      menu({
        key: "manage",
        path: "/manage",
        children: [menu({ key: "users", path: "/manage/users" })],
      }),
    ],
  })

  assert.equal(isActive(item, "/manage/users"), true)
  assert.equal(isActive(item, "/other"), false)
})
