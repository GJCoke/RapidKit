import { expect, test } from "vitest"
import { restrictedFieldsFor, omitRestrictedFields } from "@/features/auth/field-permissions"

test("masked and hidden backend fields are excluded from outgoing form payloads", () => {
  const restricted = restrictedFieldsFor({ user: { email: "masked", department_id: "hidden" } }, "user")
  expect([...restricted]).toEqual(["email", "departmentId"])
  expect(omitRestrictedFields({ name: "Alice", email: "***", departmentId: null }, restricted)).toEqual({
    name: "Alice",
  })
})

test("unrestricted resources do not inherit restrictions from another resource", () => {
  expect([...restrictedFieldsFor({ user: { email: "hidden" } }, "role")]).toEqual([])
})
