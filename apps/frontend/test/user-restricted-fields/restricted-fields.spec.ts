// apps/frontend/test/user-restricted-fields/restricted-fields.spec.ts
import { describe, expect, it } from "vitest"
import { omitRestricted, restrictedUserFields } from "@/views/manage/user/composables/restricted-fields"

describe("restricted user fields", () => {
  it("maps backend field names to camelCase form keys", () => {
    expect(restrictedUserFields({ user: { phone: "masked", department_id: "hidden" } })).toEqual(
      new Set(["phone", "departmentId"]),
    )
    expect(restrictedUserFields(undefined)).toEqual(new Set())
    expect(restrictedUserFields({ department: { name: "hidden" } })).toEqual(new Set())
  })

  it("omits restricted keys from a payload", () => {
    expect(omitRestricted({ name: "n", phone: "1", email: "e" }, new Set(["phone", "email"]))).toEqual({ name: "n" })
  })
})
