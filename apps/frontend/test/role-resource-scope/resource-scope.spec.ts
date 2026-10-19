// apps/frontend/test/role-resource-scope/resource-scope.spec.ts
import { describe, expect, it } from "vitest"
import {
  ALL_SCOPE,
  dataScopeOptions,
  fieldModeOptions,
  getDataScope,
  getFieldMode,
  hasScopeControls,
  invalidScopeKey,
  invalidScopeKeys,
  resourcesForCodes,
  setDataScope,
  setFieldMode,
  type ScopeResource,
} from "@/views/manage/role/modules/resource-scope"

const user: ScopeResource = {
  key: "user",
  label: "用户",
  dataScopes: [
    { key: "dept", label: "本部门" },
    { key: "self", label: "仅本人" },
  ],
  fieldGroups: [
    { key: "contact", label: "联系方式", fields: ["phone", "email"], modes: ["masked", "hidden"] },
    { key: "remark", label: "备注", fields: ["remark"], modes: ["hidden"] },
  ],
}
const plain: ScopeResource = { key: "plain", label: "普通", dataScopes: [], fieldGroups: [] }
const labels = { visible: "可见", masked: "脱敏", hidden: "隐藏" }

describe("resource scope helpers", () => {
  it("lists all first, then declared scopes", () => {
    expect(dataScopeOptions(user, "全部")).toEqual([
      { label: "全部", value: ALL_SCOPE },
      { label: "本部门", value: "dept" },
      { label: "仅本人", value: "self" },
    ])
  })

  it("lists visible plus the group's allowed modes", () => {
    expect(fieldModeOptions(user.fieldGroups[1], labels)).toEqual([
      { label: "可见", value: "visible" },
      { label: "隐藏", value: "hidden" },
    ])
  })

  it("defaults to all / visible and drops defaults when set", () => {
    expect(getDataScope({}, "user")).toBe(ALL_SCOPE)
    expect(setDataScope({ user: "self" }, "user", ALL_SCOPE)).toEqual({})
    expect(setDataScope({}, "user", "dept")).toEqual({ user: "dept" })
    expect(getFieldMode({}, "user", "contact")).toBe("visible")
    expect(setFieldMode({}, "user", "contact", "masked")).toEqual({ user: { contact: "masked" } })
    expect(setFieldMode({ user: { contact: "masked" } }, "user", "contact", "visible")).toEqual({})
    expect(setFieldMode({ user: { contact: "masked", remark: "hidden" } }, "user", "contact", "visible")).toEqual({
      user: { remark: "hidden" },
    })
  })

  it("does not mutate inputs", () => {
    const scopes = { user: "self" }
    const modes = { user: { contact: "masked" as const } }
    setDataScope(scopes, "user", "dept")
    setFieldMode(modes, "user", "contact", "hidden")
    expect(scopes).toEqual({ user: "self" })
    expect(modes).toEqual({ user: { contact: "masked" } })
  })

  it("builds invalid keys for resources and groups", () => {
    expect(invalidScopeKey("user")).toBe("user")
    expect(invalidScopeKey("user", "contact")).toBe("user.contact")
    expect(
      invalidScopeKeys([
        { resource: "user", group: null, stored: "region", effective: "self" },
        { resource: "user", group: "remark", stored: "masked", effective: "hidden" },
      ]),
    ).toEqual(new Set(["user", "user.remark"]))
  })

  it("selects controllable resources referenced by codes", () => {
    expect(hasScopeControls(plain)).toBe(false)
    expect(resourcesForCodes(["user:read", "plain:read", "role:read"], [user, plain])).toEqual([user])
  })
})

it("keeps explicitly selected defaults for permission packages", () => {
  expect(setDataScope({ user: "self" }, "user", ALL_SCOPE, true)).toEqual({ user: "all" })
  expect(setFieldMode({ user: { contact: "hidden" } }, "user", "contact", "visible", true)).toEqual({
    user: { contact: "visible" },
  })
})
