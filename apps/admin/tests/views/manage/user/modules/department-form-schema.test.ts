import { expect, test } from "vitest"
import { departmentFormSchema, departmentPayload } from "@/views/manage/user/modules/department-form-schema"
const valid = { parentId: "", name: "Research", code: "research", sort: 0, status: "3", leaderId: "" }
test("department validation preserves pending status and accepts negative integer ordering with nullable parent and leader", () => {
  expect(departmentFormSchema.parse({ ...valid, sort: -4 })).toEqual({ ...valid, sort: -4 })
  expect(departmentPayload(departmentFormSchema.parse(valid))).toEqual({ ...valid, parentId: null, leaderId: null })
})
test("required department fields, backend length bounds and integer ordering fail with translation keys", () => {
  for (const draft of [
    { ...valid, name: " " },
    { ...valid, code: "" },
    { ...valid, name: "x".repeat(101) },
    { ...valid, code: "x".repeat(51) },
    { ...valid, sort: 1.5 },
  ]) {
    const result = departmentFormSchema.safeParse(draft)
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues.every((issue) => issue.message.startsWith("users."))).toBe(true)
  }
})
