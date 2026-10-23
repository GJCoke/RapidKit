import { expect, test } from "vitest"
import {
  createMenuValues,
  menuBody,
  flattenMenus,
  routeNameChanged,
  toggleMenuSelection,
} from "@/views/manage/menu/modules/menu-form"
import type { Menu } from "@/services/api/menu"
const parent: Menu = {
  id: "p",
  menuName: "Parent",
  routeName: "parent",
  routePath: "/parent",
  createTime: "",
  updateTime: "",
  menuType: "2",
  iconType: "1",
  status: "3",
  order: 1,
  hideInMenu: true,
  keepAlive: true,
  constant: true,
  multiTab: true,
  query: [{ key: "tab", value: "users" }],
  component: "layout.base$view.parent",
  activeMenu: "ancestor",
  permission: null,
  icon: "heart",
  i18nKey: "route.custom",
  href: "https://example.com/test",
  fixedIndexInTab: 3,
}
test("edit hydration preserves components, dynamic parameters, flags and existing backend status", () => {
  const values = createMenuValues("edit", { ...parent, routePath: "/parent/:id/:tab?" })
  expect(values).toMatchObject({
    layout: "base",
    page: "parent",
    routePath: "/parent",
    pathParam: "id/:tab?",
    activeMenu: "ancestor",
    status: "3",
  })
  expect(menuBody(values)).toMatchObject({
    component: "layout.base$view.parent",
    routePath: "/parent/:id/:tab?",
    status: "3",
    icon: "heart",
    i18nKey: "route.custom",
    href: "https://example.com/test",
    fixedIndexInTab: 3,
    order: 1,
    query: [{ key: "tab", value: "users" }],
  })
  expect(menuBody(values)).not.toHaveProperty("id")
  expect(menuBody(values)).not.toHaveProperty("children")
})
test("child creation only inherits parent id; changing route name derives path and i18n key", () => {
  expect(createMenuValues("addChild", parent)).toMatchObject({
    parentId: "p",
    menuName: "",
    status: "1",
    constant: false,
    query: [],
  })
  expect(routeNameChanged("manage_user")).toEqual({
    routeName: "manage_user",
    routePath: "/manage/user",
    i18nKey: "route.manage_user",
  })
  expect(routeNameChanged("")).toEqual({ routeName: "", routePath: "", i18nKey: "" })
})
test("submission clears inapplicable permissions, highlighting and empty query keys", () => {
  const values = {
    ...createMenuValues("add"),
    permission: "user:read",
    activeMenu: "ancestor",
    query: [
      { key: "  ", value: "drop" },
      { key: "tab", value: "" },
    ],
  }
  expect(menuBody(values)).toMatchObject({ permission: null, activeMenu: null, query: [{ key: "tab", value: "" }] })
  expect(menuBody({ ...values, menuType: "2", hideInMenu: true })).toMatchObject({
    permission: "user:read",
    activeMenu: "ancestor",
  })
  expect(menuBody({ ...values, menuType: "2", constant: true })).toMatchObject({ permission: null })
})
test("tree projection expands only requested branches and preserves descendant depth", () => {
  const child = { ...parent, id: "c", children: [{ ...parent, id: "g" }] }
  const roots = [{ ...parent, children: [child] }]
  expect(flattenMenus(roots, new Set()).map((x) => [x.id, x.depth])).toEqual([["p", 0]])
  expect(flattenMenus(roots, new Set(["p", "c"])).map((x) => [x.id, x.depth])).toEqual([
    ["p", 0],
    ["c", 1],
    ["g", 2],
  ])
})

test("tree selection propagates both directions and preserves partial branches", () => {
  const first = { ...parent, id: "first", children: undefined },
    second = { ...parent, id: "second", children: undefined }
  const root = { ...parent, children: [first, second] }
  let selected = toggleMenuSelection([root], {}, first, true)
  expect(selected).toEqual({ first: true })
  selected = toggleMenuSelection([root], selected, second, true)
  expect(selected).toEqual({ first: true, second: true, p: true })
  expect(toggleMenuSelection([root], selected, first, false)).toEqual({ second: true })
  expect(toggleMenuSelection([root], selected, root, false)).toEqual({})
})
