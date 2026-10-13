import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { test } from "vitest"
import { getTabChromeClasses } from "@/features/layout/components/chrome-page-tab"
import { getClosableTabKeys } from "@/features/layout/components/page-tabs"

const tabs = [{ key: "home", closable: false }, { key: "users" }, { key: "roles", closable: true }]

test("getClosableTabKeys excludes fixed tabs", () => {
  assert.deepEqual(getClosableTabKeys(tabs), ["users", "roles"])
})

test("getClosableTabKeys keeps the contextual tab when closing others", () => {
  assert.deepEqual(getClosableTabKeys(tabs, "users"), ["roles"])
  assert.deepEqual(getClosableTabKeys(tabs, "home"), ["users", "roles"])
})

test("getTabChromeClasses exposes themed active and inactive Chrome states", () => {
  const active = getTabChromeClasses(true)
  assert.match(active, /inline-flex/)
  assert.match(active, /gap-4/)
  assert.match(active, /px-6/)
  assert.match(active, /py-1\.5/)
  assert.match(active, /-mr-\[18px\]/)
  assert.doesNotMatch(active, /h-9|text-xs|font-medium/)
  assert.notEqual(active, getTabChromeClasses(false))
  assert.match(getTabChromeClasses(false), /text-foreground/)
})

test("PageTabs delegates custom tab rendering and context menus without dropdown triggers", async () => {
  const source = await readFile(
    new URL("../../../../src/features/layout/components/page-tabs.tsx", import.meta.url),
    "utf8",
  )
  const contextMenuSource = await readFile(
    new URL("../../../../src/features/layout/components/page-tab-context-menu.tsx", import.meta.url),
    "utf8",
  )

  assert.match(source, /addLocation\(currentRoute, `\$\{pathname\}\$\{search\}`, \(key\) => t\(key\)\)/)
  assert.match(source, /resolveMenuIcon\(\{ icon: tab\.icon, localIcon: tab\.localIcon \}\)/)
  assert.match(source, /<ChromePageTab/)
  assert.match(source, /<PageTabContextMenu/)
  assert.match(source, /bg-background/)
  assert.match(source, /className="flex h-full w-max items-end pr-\[18px\]"/)
  assert.doesNotMatch(source, /min-w-max/)
  assert.doesNotMatch(source, /bg-muted\/30/)
  assert.doesNotMatch(source, /DropdownMenu|DropdownMenuTrigger/)
  assert.match(contextMenuSource, /<ContextMenuTrigger render=\{children\} \/>/)
  assert.doesNotMatch(contextMenuSource, /<(?:div|span)[^>]*>\s*\{children\}/)
})
