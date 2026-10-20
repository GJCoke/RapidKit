import { describe, expect, it } from "vitest"
import { buildPermissionCodeOptions, requiresMenuPermission } from "@/views/manage/menu/modules/permission-options"

const catalog: Api.Permission.Catalog = {
  resources: [
    { key: "user", label: "用户", dataScopes: [], fieldGroups: [] },
    { key: "empty", label: "空资源", dataScopes: [], fieldGroups: [] },
  ],
  codes: [
    { code: "user:read", resource: "user", label: "查看用户", abacAction: "read", depends: [], source: "code" },
    { code: "user:sync", resource: "user", label: "同步用户", abacAction: "write", depends: [], source: "code" },
  ],
}

describe("menu permission options", () => {
  it("groups codes by resource and hides resources without codes", () => {
    expect(buildPermissionCodeOptions(catalog)).toEqual([
      {
        type: "group",
        key: "user",
        label: "用户",
        children: [
          { label: "查看用户（user:read）", value: "user:read" },
          { label: "同步用户（user:sync）", value: "user:sync" },
        ],
      },
    ])
  })

  it("returns no options before the catalog loads", () => {
    expect(buildPermissionCodeOptions(null)).toEqual([])
  })

  it("requires a permission only for non-constant page menus", () => {
    expect(requiresMenuPermission("2", false)).toBe(true)
    expect(requiresMenuPermission("2", true)).toBe(false)
    expect(requiresMenuPermission("1", false)).toBe(false)
  })
})
