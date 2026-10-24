import { protectUserCreateBody } from "@/services/user-field-policy"
import { z } from "zod"
import type { CreateUserBody, UpdateUserBody } from "@/services/api/user"
import { omitRestrictedFields } from "@/features/auth/field-permissions"

const text = () =>
  z.string({ required_error: "users.validation.required", invalid_type_error: "users.validation.required" })
const optionalText = () => text().optional().default("")
export function createUserFormSchema(restricted: ReadonlySet<string> = new Set()) {
  return z.object({
    name: restricted.has("name")
      ? text()
      : text().trim().min(2, "users.validation.name").max(100, "users.validation.name"),
    username: restricted.has("username")
      ? text()
      : text()
          .trim()
          .min(5, "users.validation.username")
          .max(100, "users.validation.username")
          .regex(/^[\u4E00-\u9FA5a-zA-Z0-9_-]+$/, "users.validation.username"),
    email: restricted.has("email") ? text() : text().email("users.validation.email").max(254, "users.validation.email"),
    phone: optionalText(),
    avatar: optionalText(),
    nickname: optionalText(),
    gender: optionalText(),
    status: z.enum(["1", "2", "3"], { errorMap: () => ({ message: "users.validation.status" }) }),
    roles: z.array(text(), { invalid_type_error: "users.validation.required" }),
    isAdmin: z.boolean({ invalid_type_error: "users.validation.required" }),
    departmentId: optionalText(),
    remark: optionalText(),
  })
}
export const userFormSchema = createUserFormSchema()
export type UserFormValues = z.infer<typeof userFormSchema>

function profilePayload(values: UserFormValues) {
  return {
    ...values,
    phone: values.phone || null,
    avatar: values.avatar || null,
    nickname: values.nickname || null,
    gender: values.gender || null,
    departmentId: values.departmentId || null,
    remark: values.remark || null,
  }
}
export function buildUserCreateBody(
  values: UserFormValues,
  allowAdmin: boolean,
  restricted: ReadonlySet<string> = new Set(),
): CreateUserBody {
  return protectUserCreateBody(profilePayload(values), restricted, allowAdmin)
}
export function buildUserUpdateBody(
  values: UserFormValues,
  restricted: ReadonlySet<string>,
  allowAdmin: boolean,
): UpdateUserBody {
  return omitRestrictedFields(profilePayload(values), new Set([...restricted, ...(!allowAdmin ? ["isAdmin"] : [])]))
}
