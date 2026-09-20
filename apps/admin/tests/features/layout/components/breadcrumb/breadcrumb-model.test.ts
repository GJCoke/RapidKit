import { describe, expect, test } from "vitest"
import type { MenuItem } from "@/stores/route"
import { buildBreadcrumbs } from "@/features/layout/components/breadcrumb/breadcrumb-model"

function menu(key: string, path: string, children?: MenuItem[], extra: Partial<MenuItem> = {}): MenuItem {
  return { key, path, title: key, order: 0, hideInMenu: false, children, ...extra }
}

describe("buildBreadcrumbs", () => {
  test("uses menu hierarchy instead of URL prefixes and builds recursive visible options", () => {
    const profile = menu("profile", "/account/profile", undefined, { icon: "user" })
    const security = menu("security", "/account/security")
    const account = menu("account", "/workspace", [profile, security], { localIcon: "settings" })
    const root = menu("root", "/root", [account])

    const trail = buildBreadcrumbs({
      pathname: "/account/profile",
      menus: [root],
      flat: { "/account/profile": profile },
    })

    expect(trail.map((item) => item.key)).toEqual(["root", "account", "profile"])
    expect(trail[0]?.options).toEqual([
      expect.objectContaining({
        key: "account",
        options: [expect.objectContaining({ key: "profile" }), expect.objectContaining({ key: "security" })],
      }),
    ])
    expect(trail[1]?.options.map((item) => item.key)).toEqual(["profile", "security"])
    expect(trail[2]).toMatchObject({ current: true, icon: "user", options: [] })
    expect(trail.filter((item) => item.current)).toHaveLength(1)
  })

  test("keeps pathless grouping nodes in the trail", () => {
    const users = menu("users", "/users")
    const identity = menu("identity", "", [users])
    const system = menu("system", "", [identity])

    expect(
      buildBreadcrumbs({ pathname: "/users", menus: [system], flat: { "/users": users } }).map((item) => item.key),
    ).toEqual(["system", "identity", "users"])
  })

  test("excludes hidden children from dropdown options", () => {
    const visible = menu("visible", "/visible")
    const hidden = menu("hidden", "/hidden", undefined, { hideInMenu: true })
    const root = menu("root", "", [visible, hidden])

    const trail = buildBreadcrumbs({ pathname: "/visible", menus: [root], flat: { "/visible": visible } })
    expect(trail[0]?.options.map((item) => item.key)).toEqual(["visible"])
  })

  test("appends a hidden current route after its visible activeMenu trail", () => {
    const users = menu("users", "/manage/users")
    const manage = menu("manage", "", [users])
    const detail = menu("user_detail", "/manage/users/42", undefined, {
      title: "User detail",
      hideInMenu: true,
      activeMenu: "users",
      localIcon: "user",
    })

    const trail = buildBreadcrumbs({
      pathname: detail.path,
      menus: [manage],
      flat: { [detail.path]: detail },
    })

    expect(trail.map((item) => item.key)).toEqual(["manage", "users", "user_detail"])
    expect(trail.at(-1)).toMatchObject({ current: true, title: "User detail", localIcon: "user" })
    expect(trail.slice(0, -1).every((item) => !item.current)).toBe(true)
  })

  test("resolves a hidden detail route from its dynamic path pattern", () => {
    const users = menu("users", "/manage/users")
    const detail = menu("user_detail", "/manage/users/:id", undefined, {
      title: "User detail",
      hideInMenu: true,
      activeMenu: "users",
    })

    const trail = buildBreadcrumbs({
      pathname: "/manage/users/42",
      menus: [users],
      flat: { [detail.path]: detail },
    })

    expect(trail.map((item) => item.key)).toEqual(["users", "user_detail"])
  })

  test("returns no misleading trail for an invalid activeMenu", () => {
    const detail = menu("detail", "/detail/42", undefined, {
      hideInMenu: true,
      activeMenu: "missing",
    })
    expect(buildBreadcrumbs({ pathname: detail.path, menus: [], flat: { [detail.path]: detail } })).toEqual([])
  })

  test("does not duplicate a route when activeMenu equals the current key", () => {
    const users = menu("users", "/users")
    const current = { ...users, hideInMenu: true, activeMenu: "users" }

    const trail = buildBreadcrumbs({ pathname: "/users", menus: [users], flat: { "/users": current } })
    expect(trail.map((item) => item.key)).toEqual(["users"])
  })

  test("returns an empty trail for an unknown pathname", () => {
    expect(buildBreadcrumbs({ pathname: "/unknown", menus: [], flat: {} })).toEqual([])
  })
})
