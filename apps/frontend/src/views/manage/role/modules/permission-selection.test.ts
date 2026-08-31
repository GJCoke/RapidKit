import assert from "node:assert/strict"
import test from "node:test"
import { buildPermissionCheckedKeys, normalizePermissionSelection } from "./permission-selection"

const menuTree: Api.SystemManage.MenuTree[] = [
  {
    id: "system",
    menuName: "系统管理",
    routeName: "manage",
    constant: false,
    children: [
      {
        id: "user",
        menuName: "用户管理",
        routeName: "manage_user",
        constant: false,
        buttons: [
          { code: "user:create", desc: "新增用户" },
          { code: "user:delete", desc: "删除用户" },
        ],
        interfaces: ["user:list", "user:create"],
      },
      {
        id: "role",
        menuName: "角色管理",
        routeName: "manage_role",
        constant: false,
      },
    ],
  },
]

test("restores menu, button, and interface permissions exactly", () => {
  assert.deepEqual(
    buildPermissionCheckedKeys({
      routerPermissions: ["manage_user"],
      buttonPermissions: ["user:create"],
      interfacePermissions: ["user:list"],
    }),
    ["menu:manage_user", "btn:user:create", "api:user:list"],
  )
})

test("keeps an explicitly selected menu independent from descendants and siblings", () => {
  assert.deepEqual(normalizePermissionSelection(["menu:manage_role"], menuTree), {
    routerPermissions: ["manage", "manage_role"],
    buttonPermissions: [],
    interfacePermissions: [],
  })
})

test("adds owning and ancestor menus for selected buttons and interfaces", () => {
  assert.deepEqual(
    normalizePermissionSelection(["btn:user:create", "api:user:list"], menuTree),
    {
      routerPermissions: ["manage", "manage_user"],
      buttonPermissions: ["user:create"],
      interfacePermissions: ["user:list"],
    },
  )
})

test("does not grant sibling menus or other permissions while completing the path", () => {
  assert.deepEqual(normalizePermissionSelection(["btn:user:create"], menuTree), {
    routerPermissions: ["manage", "manage_user"],
    buttonPermissions: ["user:create"],
    interfacePermissions: [],
  })
})

test("deduplicates menus contributed by explicit and inferred selections", () => {
  assert.deepEqual(
    normalizePermissionSelection(
      ["menu:manage", "menu:manage_user", "btn:user:create", "api:user:list"],
      menuTree,
    ),
    {
      routerPermissions: ["manage", "manage_user"],
      buttonPermissions: ["user:create"],
      interfacePermissions: ["user:list"],
    },
  )
})

test("preserves unknown button and interface permissions without guessing a menu", () => {
  assert.deepEqual(
    normalizePermissionSelection(["btn:removed:edit", "api:removed:list"], menuTree),
    {
      routerPermissions: [],
      buttonPermissions: ["removed:edit"],
      interfacePermissions: ["removed:list"],
    },
  )
})
