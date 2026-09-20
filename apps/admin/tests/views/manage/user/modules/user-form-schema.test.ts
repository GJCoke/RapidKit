import { expect, test } from "vitest"
import { userFormSchema } from "@/views/manage/user/modules/user-form-schema"

const valid = {
  name: "Ada Lovelace",
  username: "adalovelace",
  email: "ada@example.com",
  status: "1",
  roles: [],
  isAdmin: false,
  phone: "",
  avatar: "",
  nickname: "",
  gender: "",
  departmentId: "",
  remark: "",
}

test("user form accepts the backend-aligned minimum", () => {
  expect(userFormSchema.safeParse(valid).success).toBe(true)
})

test("user form rejects short usernames and malformed email", () => {
  expect(userFormSchema.safeParse({ ...valid, username: "ada", email: "bad" }).success).toBe(false)
})
