import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { test } from "vitest"
import type { MenuItem } from "@/stores/route"
import {
  getMenuButtonClasses,
  getMenuChevronClasses,
  getMenuLabelClasses,
  getSubmenuPanelClasses,
  isActive,
  navigateToMenuItem,
  resolveMenuGroupExpanded,
} from "@/features/layout/components/sidebar-menu"

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

  navigateToMenuItem(menu({ path: "/manage/users" }), {
    navigate: (path) => events.push(`navigate:${path}`),
    openExternal: () => undefined,
    closeFlyout: () => events.push("close"),
  })

  assert.deepEqual(events, ["navigate:/manage/users", "close"])
})

test("navigateToMenuItem opens external links safely without internal navigation", () => {
  const events: string[] = []

  navigateToMenuItem(menu({ href: "https://example.com/docs" }), {
    navigate: (path) => events.push(`navigate:${path}`),
    openExternal: (href, target, features) => events.push(`open:${href}:${target}:${features}`),
    closeFlyout: () => events.push("close"),
  })

  assert.deepEqual(events, ["open:https://example.com/docs:_blank:noopener,noreferrer", "close"])
})

test("collapsed menu delegates focus restoration to Base UI", async () => {
  const source = await readFile(new URL("../../../../src/features/layout/components/sidebar/sidebar-menu-group.tsx", import.meta.url), "utf8")

  assert.match(source, /finalFocus=\{popoverTriggerRef\}/)
  assert.doesNotMatch(source, /onCloseAutoFocus|asChild/)
})

test("sidebar collapse keeps one stable menu tree", async () => {
  const groupSource = await readFile(new URL("../../../../src/features/layout/components/sidebar/sidebar-menu-group.tsx", import.meta.url), "utf8")
  const leafSource = await readFile(new URL("../../../../src/features/layout/components/sidebar/sidebar-menu-leaf.tsx", import.meta.url), "utf8")

  assert.doesNotMatch(groupSource, /useState\(branchActive\)|resolveMenuGroupExpanded/)
  assert.match(leafSource, /<Tooltip disabled=\{!collapsed\}>/)
  assert.match(groupSource, /<Popover open=\{collapsed && popoverOpen\}/)
})

test("menu labels animate their width and opacity with the sidebar", () => {
  assert.match(getMenuLabelClasses(false), /max-w-48/)
  assert.match(getMenuLabelClasses(false), /opacity-100/)
  assert.match(getMenuLabelClasses(true), /max-w-0/)
  assert.match(getMenuLabelClasses(true), /opacity-0/)
  assert.match(getMenuLabelClasses(true), /duration-300/)
})

test("menu buttons avoid animating layout properties during route changes", () => {
  assert.match(getMenuButtonClasses(false), /h-\[var\(--menu-item-height\)\]/)
  assert.match(getMenuButtonClasses(false), /gap-2/)
  assert.match(getMenuButtonClasses(false), /px-3/)
  assert.match(getMenuButtonClasses(true), /justify-center/)
  assert.match(getMenuButtonClasses(true), /gap-0/)
  assert.match(getMenuButtonClasses(true), /px-0/)
  assert.match(getMenuButtonClasses(true), /transition-colors/)
  assert.doesNotMatch(getMenuButtonClasses(true), /transition-all/)
})

test("expanded and collapsed menu buttons keep the same fixed height", () => {
  assert.match(getMenuButtonClasses(false), /h-\[var\(--menu-item-height\)\]/)
  assert.match(getMenuButtonClasses(true), /h-\[var\(--menu-item-height\)\]/)
})

test("submenu panels animate the measured Base UI height in both directions", () => {
  const classes = getSubmenuPanelClasses()

  assert.match(classes, /h-\[var\(--collapsible-panel-height\)\]/)
  assert.match(classes, /data-\[starting-style\]:h-0/)
  assert.match(classes, /data-\[ending-style\]:h-0/)
  assert.match(classes, /transition-\[height,opacity\]/)
  assert.match(classes, /duration-300/)
  assert.match(classes, /contain-layout/)
  assert.match(classes, /will-change-\[height,opacity\]/)
  assert.doesNotMatch(classes, /grid-rows/)
})

test("submenu chevron follows the controlled expanded state", () => {
  assert.match(getMenuChevronClasses(true, false), /rotate-180/)
  assert.match(getMenuChevronClasses(false, false), /rotate-0/)
  assert.match(getMenuChevronClasses(true, true), /rotate-0/)
})

test("collapsing the sidebar closes every expanded submenu", () => {
  assert.equal(resolveMenuGroupExpanded(true, true, true), false)
  assert.equal(resolveMenuGroupExpanded(true, false, true), false)
})

test("an active branch reopens after the sidebar expands", () => {
  assert.equal(resolveMenuGroupExpanded(false, true, false), true)
  assert.equal(resolveMenuGroupExpanded(false, false, false), false)
  assert.equal(resolveMenuGroupExpanded(true, false, false), true)
})
