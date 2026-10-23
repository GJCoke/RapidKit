import { describe, expect, it } from "vitest"
import { computePackageApplyDiff, formatScopeChange } from "@/views/manage/role/modules/package-apply-diff"

const current = {
  permissionCodes: ["role:read"],
  dataScopes: { user: "self", department: "dept" },
  fieldModes: { user: { contact: "hidden" as const } },
}
const userFull = {
  codes: ["user:read", "role:read", "user:update"],
  dataScopes: { user: "dept_subtree" },
  fieldModes: { user: { remark: "hidden" as const } },
}
const userRead = { codes: ["user:read"], dataScopes: {}, fieldModes: {} }

describe("computePackageApplyDiff", () => {
  it("merge keeps current grants and overrides scopes per resource", () => {
    const diff = computePackageApplyDiff(current, [userFull, userRead], "merge")
    expect(diff.next.permissionCodes).toEqual(["role:read", "user:read", "user:update"])
    expect(diff.next.dataScopes).toEqual({ user: "dept_subtree", department: "dept" })
    expect(diff.next.fieldModes).toEqual({ user: { contact: "hidden", remark: "hidden" } })
    expect(diff.addedCodes).toEqual(["user:read", "user:update"])
    expect(diff.scopeChanges).toEqual([
      { resource: "user", group: null, before: "self", after: "dept_subtree" },
      { resource: "user", group: "remark", before: "visible", after: "hidden" },
    ])
  })

  it("replace keeps only package grants and reports removals", () => {
    const diff = computePackageApplyDiff(current, [userRead], "replace")
    expect(diff.next).toEqual({ permissionCodes: ["user:read"], dataScopes: {}, fieldModes: {} })
    expect(diff.removedCodes).toEqual(["role:read"])
    expect(diff.scopeChanges).toEqual([
      { resource: "user", group: null, before: "self", after: "all" },
      { resource: "department", group: null, before: "dept", after: "all" },
      { resource: "user", group: "contact", before: "hidden", after: "visible" },
    ])
  })

  it("reports no change when packages are already covered", () => {
    const diff = computePackageApplyDiff(current, [{ codes: ["role:read"], dataScopes: {}, fieldModes: {} }], "merge")
    expect(diff.hasChanges).toBe(false)
  })

  it("formats scope changes", () => {
    expect(formatScopeChange({ resource: "user", group: "contact", before: "hidden", after: "visible" })).toBe(
      "user.contact: hidden → visible",
    )
    expect(formatScopeChange({ resource: "user", group: null, before: "self", after: "all" })).toBe("user: self → all")
  })
})

it("normalizes explicitly selected defaults after overriding existing restrictions", () => {
  const diff = computePackageApplyDiff(
    current,
    [{ codes: [], dataScopes: { user: "all" }, fieldModes: { user: { contact: "visible" } } }],
    "merge",
  )
  expect(diff.next.dataScopes).toEqual({ department: "dept" })
  expect(diff.next.fieldModes).toEqual({})
  expect(diff.scopeChanges).toEqual([
    { resource: "user", group: null, before: "self", after: "all" },
    { resource: "user", group: "contact", before: "hidden", after: "visible" },
  ])
})
