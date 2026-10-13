import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { test } from "vitest"

import { getSidebarClasses } from "@/features/layout/components/sidebar"

test("sidebar width uses the same 300ms transition in both states", () => {
  assert.match(getSidebarClasses(false), /transition-all/)
  assert.match(getSidebarClasses(false), /duration-300/)
  assert.match(getSidebarClasses(true), /transition-all/)
  assert.match(getSidebarClasses(true), /duration-300/)
})

test("sidebar passes collapse state directly without a delayed tree swap", async () => {
  const source = await readFile(
    new URL("../../../../src/features/layout/components/sidebar.tsx", import.meta.url),
    "utf8",
  )

  assert.doesNotMatch(source, /setTimeout|compact/)
  assert.match(source, /<SidebarMenu collapsed=\{collapsed\} menus=\{menus\} \/>/)
})
