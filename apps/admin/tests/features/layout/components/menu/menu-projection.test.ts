import { describe, expect, test } from "vitest"
import type { MenuItem } from "@/stores/route"
import { findFirstNavigableDescendant, projectMenus } from "@/features/layout/components/menu/menu-projection"

function menu(key: string, path: string, children?: MenuItem[], extra: Partial<MenuItem> = {}): MenuItem {
  return { key, path, title: key, order: 0, hideInMenu: false, children, ...extra }
}

describe("projectMenus", () => {
  test("derives each visible level from the selected route", () => {
    const users = menu("users", "/system/users")
    const roles = menu("roles", "/system/roles")
    const hidden = menu("hidden", "/system/hidden", undefined, { hideInMenu: true })
    const identity = menu("identity", "", [users, roles, hidden])
    const system = menu("system", "", [identity])
    const dashboard = menu("dashboard", "/dashboard")

    const result = projectMenus({ menus: [system, dashboard], pathname: users.path, currentRoute: users })
    expect(result.selectedKey).toBe("users")
    expect(result.selectedPath).toEqual(["system", "identity", "users"])
    expect(result.firstLevelMenus.map((item) => item.key)).toEqual(["system", "dashboard"])
    expect(result.activeFirstLevel?.key).toBe("system")
    expect(result.secondLevelMenus.map((item) => item.key)).toEqual(["identity"])
    expect(result.activeSecondLevel?.key).toBe("identity")
    expect(result.childLevelMenus.map((item) => item.key)).toEqual(["users", "roles"])
  })

  test("uses activeMenu for a hidden route", () => {
    const users = menu("users", "/users")
    const system = menu("system", "", [users])
    const detail = menu("detail", "/users/:id", undefined, { hideInMenu: true, activeMenu: "users" })

    const result = projectMenus({ menus: [system], pathname: "/users/42", currentRoute: detail })
    expect(result.selectedKey).toBe("users")
    expect(result.selectedPath).toEqual(["system", "users"])
  })

  test("finds the first visible navigable deepest descendant", () => {
    const hidden = menu("hidden", "/hidden", undefined, { hideInMenu: true })
    const target = menu("target", "/target")
    const root = menu("root", "", [hidden, menu("branch", "", [target])])
    expect(findFirstNavigableDescendant(root)?.key).toBe("target")
    expect(findFirstNavigableDescendant(menu("empty", "", [hidden]))).toBeNull()
  })
})
