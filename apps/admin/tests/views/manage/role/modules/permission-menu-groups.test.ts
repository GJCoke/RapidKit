import type { PermissionMenu } from "@/services/api/role"
import { expect, it } from "vitest"
import { buildPermissionModules } from "@/views/manage/role/modules/permission-menu-groups"
import { menu, notificationCatalog, notificationMenus } from "./fixtures"

it("groups all 14 notification actions in menu order and retains unanchored resources", () => {
  const { modules } = buildPermissionModules(notificationCatalog, notificationMenus)
  expect(modules.map((m) => m.key)).toEqual(["notifications", "other"])
  expect(modules[0]!.entries.map((e) => e.row.resource.key)).toEqual([
    "notification-template",
    "notification",
    "notification-delivery",
  ])
  expect(modules[0]!.entries.flatMap((e) => e.row.codes)).toHaveLength(14)
  expect(modules[1]!.entries.map((e) => e.row.resource.key).sort()).toEqual(["department", "role", "user"])
})

it("chooses a stable unique owner for shared resources and keeps nested paths", () => {
  const nested = menu("nested", {
    menuName: "二级目录",
    menuType: "1",
    children: [menu("user", { permission: "user:options" })],
  })
  const roots = [
    menu("b", { menuType: "1", children: [nested] }),
    menu("a", { menuType: "1", children: [menu("alias", { permission: "user:options" })] }),
  ]
  const result = buildPermissionModules(notificationCatalog, roots).modules
  expect(result.filter((m) => m.key !== "other").map((m) => m.key)).toEqual(["a", "b"])
  expect(result[0]!.entries[0]!.ownerKey).toBe("a")
  expect(result[1]!.entries[0]!.ownerKey).toBe("a")
  expect(result[1]!.entries[0]!.path).toEqual(["二级目录"])
  expect(buildPermissionModules(notificationCatalog, roots.toReversed())).toEqual(
    buildPermissionModules(notificationCatalog, roots),
  )
})

it("does not use hidden, disabled, constant or external pages or their children as anchors", () => {
  const excluded: Partial<PermissionMenu>[] = [
    { hideInMenu: true },
    { status: "2" },
    { constant: true },
    { href: "https://example.com" },
  ]
  const roots = excluded.map((props, i) =>
    menu(String(i), { menuType: "1", ...props, children: [menu(`page-${i}`, { permission: "notification:read" })] }),
  )
  const result = buildPermissionModules(notificationCatalog, [
    ...roots,
    menu("unknown", { permission: "missing:read" }),
  ])
  expect(result.modules.map((m) => m.key)).toEqual(["other"])
  expect(result.modules[0]!.entries).toHaveLength(6)
  expect(result.invalidMenuPermissions).toEqual(["missing:read"])
})

it("maps page permissions by catalog resource rather than parsing permission prefixes", () => {
  const catalog = {
    ...notificationCatalog,
    codes: notificationCatalog.codes.map((c) => (c.code === "user:options" ? { ...c, resource: "role" } : c)),
  }
  const { modules } = buildPermissionModules(catalog, [menu("page", { permission: "user:options" })])
  expect(modules[0]!.entries[0]!.row.resource.key).toBe("role")
})
