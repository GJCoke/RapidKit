import { describe, expect, it } from "vitest"
import {
  buildPermissionRows,
  expandImpliedCodes,
  splitKnownCodes,
  toggleCode,
} from "@/views/manage/role/modules/permission-matrix"

function code(
  value: string,
  depends: string[] = [],
  source: Api.Permission.CatalogCode["source"] = "code",
): Api.Permission.CatalogCode {
  const [resource] = value.split(":")
  return { code: value, resource, label: value, abacAction: "read", depends, source }
}

const catalog: Api.Permission.Catalog = {
  resources: [
    { key: "user", label: "用户", dataScopes: [], fieldGroups: [] },
    { key: "department", label: "部门", dataScopes: [], fieldGroups: [] },
    { key: "role", label: "角色", dataScopes: [], fieldGroups: [] },
    { key: "unused", label: "未使用", dataScopes: [], fieldGroups: [] },
  ],
  codes: [
    code("user:update", ["user:read", "department:read", "role:read"]),
    code("user:read"),
    code("department:read"),
    code("role:read"),
    code("role:grant", ["role:read", "user:update"]),
  ],
}

describe("permission matrix", () => {
  it("groups codes by resource in catalog order, read code first, skipping empty resources", () => {
    const rows = buildPermissionRows(catalog)

    expect(rows.map((row) => row.resource.key)).toEqual(["user", "department", "role"])
    expect(rows[0].codes.map((item) => item.code)).toEqual(["user:read", "user:update"])
    expect(rows[2].codes.map((item) => item.code)).toEqual(["role:read", "role:grant"])
  })

  it("expands depends transitively and excludes directly selected codes", () => {
    expect(expandImpliedCodes(["role:grant"], catalog)).toEqual([
      "department:read",
      "role:read",
      "user:read",
      "user:update",
    ])
    expect(expandImpliedCodes(["user:update", "user:read"], catalog)).toEqual(["department:read", "role:read"])
    expect(expandImpliedCodes([], catalog)).toEqual([])
  })

  it("separates codes missing from the catalog or reported invalid by the server", () => {
    expect(splitKnownCodes(["user:read", "legacy:old", "role:read"], ["role:read"], catalog)).toEqual({
      known: ["user:read"],
      invalid: ["legacy:old", "role:read"],
    })
  })

  it("toggles a code without duplicates", () => {
    expect(toggleCode(["user:read"], "role:read", true)).toEqual(["user:read", "role:read"])
    expect(toggleCode(["user:read", "role:read"], "user:read", true)).toEqual(["role:read", "user:read"])
    expect(toggleCode(["user:read", "role:read"], "user:read", false)).toEqual(["role:read"])
  })
})
