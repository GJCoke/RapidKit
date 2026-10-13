import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { test } from "vitest"

const adminLayout = await readFile(
  new URL("../../../../src/features/layout/components/admin-layout.tsx", import.meta.url),
  "utf8",
)
const layoutShell = await readFile(
  new URL("../../../../src/features/layout/components/layout-shell.tsx", import.meta.url),
  "utf8",
)
const pageContainer = await readFile(
  new URL("../../../../src/features/layout/components/page-container.tsx", import.meta.url),
  "utf8",
)
const routeTransition = await readFile(
  new URL("../../../../src/features/layout/components/route-transition.tsx", import.meta.url),
  "utf8",
)
const sidebarMenu = await readFile(
  new URL("../../../../src/features/layout/components/sidebar/sidebar-menu.tsx", import.meta.url),
  "utf8",
)

test("main route content owns an independent shadcn scroll viewport", () => {
  assert.match(layoutShell, /import \{ ScrollArea \} from "@rapidkit\/ui\/components\/scroll-area"/)
  assert.match(layoutShell, /data-layout-scroll-owner=\{owner\}/)
  assert.match(layoutShell, /className="min-h-0 flex-1"/)
  assert.match(
    layoutShell,
    /<main data-layout-scroll=\{scrollMode\} className=\{fixedHeaderTabs \? "h-full" : "min-h-full"\}>/,
  )
  assert.doesNotMatch(adminLayout, /className="min-h-full"/)
  assert.match(pageContainer, /data-page-container/)
  assert.match(pageContainer, /cn\("[^"]*h-full[^"]*w-full[^"]*"/)
  assert.doesNotMatch(pageContainer, /p-4/)
  assert.match(routeTransition, /"h-full bg-muted\/30 p-4"/)
  assert.doesNotMatch(routeTransition, /"min-h-full"/)
  assert.doesNotMatch(adminLayout, /<main className="flex-1 overflow-auto">/)
  assert.match(adminLayout, /<LayoutShell[\s\S]*header=[\s\S]*tabs=/)
})

test("sidebar menu owns an independent shadcn scroll viewport", () => {
  assert.match(sidebarMenu, /import \{ ScrollArea \} from "@rapidkit\/ui\/components\/scroll-area"/)
  assert.match(sidebarMenu, /<ScrollArea className="min-h-0 flex-1">/)
  assert.match(sidebarMenu, /<nav[^>]*data-layout-scroll="sidebar"/)
  assert.doesNotMatch(sidebarMenu, /overflow-y-auto/)
})

test("desktop layout applies the configured initial sidebar state", () => {
  assert.match(adminLayout, /setSiderCollapse\(theme\.layout\.defaultSidebarCollapsed, "theme"\)/)
  assert.match(adminLayout, /if \(!isMobile\)/)
})
