// apps/frontend/test/role-permission/catalog-groups.spec.ts
import { expect, it } from "vitest"
import { groupCatalogCodes } from "@/views/manage/role/modules/permission-catalog-groups"

const catalog: Api.SystemManage.PermissionCatalog = {
  resources: [
    { key: "department", label: "部门", dataScopes: [], fieldGroups: [] },
    { key: "user", label: "用户", dataScopes: [], fieldGroups: [] },
    { key: "empty", label: "空资源", dataScopes: [], fieldGroups: [] },
  ],
  codes: [
    {
      code: "department:read",
      resource: "department",
      label: "查看部门",
      abacAction: "read",
      depends: [],
      source: "code",
    },
    { code: "user:read", resource: "user", label: "查看用户", abacAction: "read", depends: [], source: "code" },
    {
      code: "user:update",
      resource: "user",
      label: "编辑用户",
      abacAction: "write",
      depends: ["user:read", "department:read"],
      source: "code",
    },
  ],
}

it("groups codes by resource in resource order and drops empty resources", () => {
  const groups = groupCatalogCodes(catalog)

  expect(groups.map((group) => group.key)).toEqual(["department", "user"])
  expect(groups[1].label).toBe("用户")
  expect(groups[1].codes.map((item) => item.code)).toEqual(["user:read", "user:update"])
})

it("resolves dependency labels for display", () => {
  const groups = groupCatalogCodes(catalog)
  const update = groups[1].codes[1]

  expect(groups[1].dependsLabels[update.code]).toEqual(["查看用户", "查看部门"])
})
