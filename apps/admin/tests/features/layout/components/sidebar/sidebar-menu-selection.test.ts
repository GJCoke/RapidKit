import { describe, expect, test } from "vitest"
import type { MenuItem } from "@/stores/route"
import {
  findMenuPath,
  getSelectedParentKeys,
  reconcileExpandedKeys,
  resolveSelectedMenuKey,
} from "@/features/layout/components/sidebar/sidebar-menu-selection"

const leaf = (key: string, path: string, extra: Partial<MenuItem> = {}): MenuItem => ({
  key,
  path,
  title: key,
  order: 0,
  hideInMenu: false,
  ...extra,
})
const group = (key: string, children: MenuItem[]): MenuItem => leaf(key, `/${key}`, { children })

describe("sidebar selection", () => {
  const menus = [group("system", [group("identity", [leaf("users", "/users")])])]

  test("finds arbitrary-depth paths", () => {
    expect(findMenuPath(menus, "users")).toEqual(["system", "identity", "users"])
    expect(getSelectedParentKeys(["system", "identity", "users"])).toEqual(["system", "identity"])
  })

  test("hidden routes select their visible activeMenu", () => {
    expect(
      resolveSelectedMenuKey({
        currentRoute: leaf("detail", "/users/42", { hideInMenu: true, activeMenu: "users" }),
        menus,
        pathname: "/users/42",
      }),
    ).toBe("users")
  })

  test("falls back deterministically without prefix matching", () => {
    expect(resolveSelectedMenuKey({ currentRoute: leaf("users", "/users"), menus, pathname: "/users" })).toBe("users")
    expect(resolveSelectedMenuKey({ menus, pathname: "/users" })).toBe("users")
    expect(resolveSelectedMenuKey({ menus, pathname: "/users/42" })).toBeNull()
  })

  test("route changes replace old branches with the selected parent path", () => {
    const result = reconcileExpandedKeys({
      collapsed: false,
      current: new Set(["reports"]),
      selectedPath: ["system", "identity", "users"],
      restoreSelectedPath: true,
    })
    expect([...result]).toEqual(["system", "identity"])
    expect(
      reconcileExpandedKeys({
        collapsed: true,
        current: result,
        selectedPath: ["system", "identity", "users"],
        restoreSelectedPath: true,
      }),
    ).toEqual(new Set())
  })
})
