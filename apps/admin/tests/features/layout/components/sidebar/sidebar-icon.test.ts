import { Circle, LayoutDashboard, Users } from "lucide-react"
import { expect, test } from "vitest"
import { resolveMenuIcon } from "@/features/layout/components/sidebar/sidebar-icon"

test("local icons take precedence over ordinary icons", () => {
  expect(resolveMenuIcon({ localIcon: "home", icon: "lucide:users" })).toBe(LayoutDashboard)
  expect(resolveMenuIcon({ icon: "lucide:users" })).toBe(Users)
  expect(resolveMenuIcon({ icon: "unknown" })).toBe(Circle)
})
