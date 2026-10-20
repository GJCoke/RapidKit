import { expect, it } from "vitest"
import {
  diffPermissionDraft,
  matchingResourcePackage,
  packagesForResource,
} from "@/views/manage/role/modules/permission-draft"
import type { RoleGrant } from "@/views/manage/role/modules/package-apply-diff"

const catalog: Api.Permission.Catalog = {
  resources: [
    { key: "user", label: "用户", dataScopes: [], fieldGroups: [] },
    { key: "role", label: "角色", dataScopes: [], fieldGroups: [] },
  ],
  codes: [
    {
      code: "user:read",
      resource: "user",
      label: "查看",
      source: "code",
      abacAction: "read",
      depends: ["role:options"],
    },
    {
      code: "user:update",
      resource: "user",
      label: "编辑",
      source: "code",
      abacAction: "write",
      depends: ["user:read"],
    },
    { code: "role:options", resource: "role", label: "选项", source: "code", abacAction: "read", depends: [] },
  ],
}
const current: RoleGrant = {
  permissionCodes: ["user:read", "old:read"],
  dataScopes: { user: "self" },
  fieldModes: { user: { contact: "masked" } },
}
const packages = [
  {
    key: "user.full",
    label: "用户 · 完整",
    description: "",
    codes: ["user:read", "user:update"],
    dataScopes: { user: "all" },
    fieldModes: { user: { contact: "visible" as const } },
  },
]

it("separates direct operation changes, transitive dependency changes and restrictions", () => {
  const before = { permissionCodes: [], dataScopes: {}, fieldModes: {} }
  expect(diffPermissionDraft(before, { ...current, permissionCodes: ["user:update"] }, catalog)).toMatchObject({
    addedCodes: ["user:update"],
    removedCodes: [],
    addedImplied: ["role:options", "user:read"],
    removedImplied: [],
    scopeChanges: [
      { resource: "user", group: null, before: "all", after: "self" },
      { resource: "user", group: "contact", before: "visible", after: "masked" },
    ],
    hasChanges: true,
  })
  expect(diffPermissionDraft({ ...before, permissionCodes: ["user:update"] }, before, catalog)).toMatchObject({
    removedCodes: ["user:update"],
    removedImplied: ["role:options", "user:read"],
  })
})

it("ignores code ordering and explicit default restrictions when checking dirty state", () => {
  expect(
    diffPermissionDraft(
      { permissionCodes: ["user:read", "user:update"], dataScopes: {}, fieldModes: {} },
      {
        permissionCodes: ["user:update", "user:read"],
        dataScopes: { user: "all" },
        fieldModes: { user: { contact: "visible" } },
      },
      catalog,
    ).hasChanges,
  ).toBe(false)
})

it("derives exact resource matches without claiming package provenance or fabricating packages", () => {
  expect(matchingResourcePackage(["user:read", "user:update", "role:options"], "user", packages)?.key).toBe("user.full")
  expect(matchingResourcePackage(["user:read"], "user", packages)).toBeUndefined()
  expect(matchingResourcePackage(["role:options"], "role", packages)).toBeUndefined()
})

it("excludes other-resource and mixed-resource templates from resource application", () => {
  const other = { ...packages[0]!, key: "role.full", codes: ["role:options"] }
  const mixed = { ...packages[0]!, key: "user.mixed", codes: ["user:update", "role:options"] }
  const available = [...packages, other, mixed]
  expect(packagesForResource(available, "user").map((p) => p.key)).toEqual(["user.full"])
})
