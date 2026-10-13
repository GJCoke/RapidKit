import { expect, test } from "vitest"
import {
  getMenuButtonClasses,
  getMenuIconClasses,
  getMenuIndentStyle,
} from "@/features/layout/components/sidebar/sidebar-menu-styles"

test("keeps menu icons at 18px in both sidebar states", () => {
  expect(getMenuIconClasses(false)).toContain("size-[18px]")
  expect(getMenuIconClasses(true)).toContain("size-[18px]")
  expect(getMenuIconClasses(false)).toBe(getMenuIconClasses(true))
  expect(getMenuIndentStyle(0, false)).toEqual({ paddingLeft: "12px" })
  expect(getMenuIndentStyle(1, false)).toEqual({ paddingLeft: "30px" })
})

test("active leaves use the semantic primary treatment", () => {
  const classes = getMenuButtonClasses({ collapsed: false, active: true, branchActive: false })
  expect(classes).not.toContain("text-sidebar-primary-foreground")
  expect(classes).not.toContain("bg-sidebar-primary ")
})
