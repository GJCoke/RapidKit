import assert from "node:assert/strict"
import test from "node:test"
import type { MenuItem } from "@/stores/route"
import { isActive, navigateToMenuItem, restoreMenuTriggerFocus } from "./sidebar-menu"

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

test("navigateToMenuItem closes its flyout after navigation", () => {
  const events: string[] = []

  navigateToMenuItem(
    (path) => events.push(`navigate:${path}`),
    "/manage/users",
    () => events.push("close"),
  )

  assert.deepEqual(events, ["navigate:/manage/users", "close"])
})

test("restoreMenuTriggerFocus returns focus to the collapsed group", () => {
  let focused = false

  restoreMenuTriggerFocus({ focus: () => (focused = true) })

  assert.equal(focused, true)
})
