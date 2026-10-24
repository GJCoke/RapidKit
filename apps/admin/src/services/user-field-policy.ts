import type { CreateUserBody } from "@/services/api/user"
import { omitRestrictedFields } from "@/features/auth/field-permissions"

const requiredCreateFields = ["name", "username", "email", "status", "roles", "isAdmin"]
export function hasRestrictedCreateFields(restricted: ReadonlySet<string>) {
  return requiredCreateFields.some((field) => restricted.has(field))
}
export function protectUserCreateBody(
  data: CreateUserBody,
  restricted: ReadonlySet<string>,
  allowAdmin: boolean,
): CreateUserBody {
  if (hasRestrictedCreateFields(restricted)) throw new Error("Required user fields restricted")
  return {
    ...omitRestrictedFields(data, restricted),
    name: data.name,
    username: data.username,
    email: data.email,
    status: data.status,
    roles: data.roles,
    isAdmin: allowAdmin && Boolean(data.isAdmin),
  }
}
