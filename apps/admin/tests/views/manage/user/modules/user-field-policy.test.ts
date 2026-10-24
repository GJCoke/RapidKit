import { expect, test } from "vitest"
import {
  createUserFormSchema,
  buildUserUpdateBody,
  buildUserCreateBody,
  type UserFormValues,
} from "@/views/manage/user/modules/user-form-schema"
const values: UserFormValues = {
  name: "Parity User",
  username: "parity_user",
  email: "parity@example.test",
  phone: "",
  avatar: "",
  nickname: "",
  gender: "",
  status: "3",
  roles: ["READER"],
  isAdmin: true,
  departmentId: "",
  remark: "",
}
test("masked and hidden edit fields are not validated as readable inputs and are excluded from the submitted update", () => {
  const restricted = new Set(["email", "phone", "remark"])
  const draft = { ...values, email: "", phone: "1***9", remark: "hidden" }
  expect(createUserFormSchema(restricted).safeParse(draft).success).toBe(true)
  const payload = buildUserUpdateBody(draft, restricted, true)
  expect(payload).not.toHaveProperty("email")
  expect(payload).not.toHaveProperty("phone")
  expect(payload).not.toHaveProperty("remark")
  expect(payload).toMatchObject({ status: "3", roles: ["READER"], isAdmin: true, departmentId: null })
})
test("ordinary required fields stay validated, error messages are translation keys and non-administrators cannot submit isAdmin", () => {
  const invalid = createUserFormSchema(new Set()).safeParse({ ...values, email: "bad", username: "bad name" })
  expect(invalid.success).toBe(false)
  if (!invalid.success) expect(invalid.error.issues.every((issue) => issue.message.startsWith("users."))).toBe(true)
  expect(buildUserUpdateBody(values, new Set(), false)).not.toHaveProperty("isAdmin")
  expect(buildUserCreateBody(values, false)).toMatchObject({
    isAdmin: false,
    status: "3",
    departmentId: null,
    phone: null,
  })
})
test("normal edits can explicitly clear optional profile fields without changing existing status, roles or department", () => {
  expect(buildUserUpdateBody({ ...values, departmentId: "d1", gender: "other" }, new Set(), true)).toMatchObject({
    phone: null,
    avatar: null,
    nickname: null,
    remark: null,
    gender: "other",
    departmentId: "d1",
    status: "3",
    roles: ["READER"],
  })
})

test("creation omits optional restricted fields and cannot submit required fields that became restricted", () => {
  const created = buildUserCreateBody(
    { ...values, remark: "private", phone: "123" },
    false,
    new Set(["remark", "phone"]),
  )
  expect(created).not.toHaveProperty("remark")
  expect(created).not.toHaveProperty("phone")
  expect(created).toMatchObject({ name: values.name, email: values.email, roles: ["READER"], isAdmin: false })
  expect(() => buildUserCreateBody(values, false, new Set(["email"]))).toThrow("Required user fields restricted")
})
