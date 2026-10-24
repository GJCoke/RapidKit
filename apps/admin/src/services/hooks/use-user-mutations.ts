import { protectUserCreateBody } from "@/services/user-field-policy"
import {
  batchDeleteUsers,
  changeUserPassword,
  createUser,
  deleteUser,
  resendUserInvite,
  updateUser,
  type ChangePasswordBody,
  type CreateUserBody,
  type UpdateUserBody,
} from "@/services/api/user"
import { getAuthSession } from "@/services/auth-session"
import { requireDirectoryPermission } from "@/services/user-access"
import { useAuthStore } from "@/stores/auth"
import { omitRestrictedFields, restrictedFieldsFor } from "@/features/auth/field-permissions"
import { canResetUserPassword } from "@/views/manage/user/modules/user-eligibility"
import { useDirectoryWrite } from "./use-directory-write"

export function useCreateUser() {
  return useDirectoryWrite("user:create", (data: CreateUserBody) => {
    const actor = useAuthStore.getState().userInfo
    return createUser(
      protectUserCreateBody(data, restrictedFieldsFor(actor?.restrictedFields, "user"), Boolean(actor?.isAdmin)),
    )
  })
}
export function useUpdateUser() {
  return useDirectoryWrite("user:update", ({ userId, data }: { userId: string; data: UpdateUserBody }) => {
    const actor = useAuthStore.getState().userInfo
    const restricted = new Set(restrictedFieldsFor(actor?.restrictedFields, "user"))
    if (!actor?.isAdmin) restricted.add("isAdmin")
    return updateUser(userId, omitRestrictedFields(data, restricted))
  })
}
export function useDeleteUsers() {
  return useDirectoryWrite("user:delete", (ids: string[]) => {
    if (!ids.length) throw new Error("No directory users selected")
    return ids.length === 1 ? deleteUser(ids[0]) : batchDeleteUsers({ ids })
  })
}
export function useResendUserInvite() {
  return useDirectoryWrite("user:update", (userId: string) => {
    // The existing entry belongs to editing; the API additionally requires create.
    requireDirectoryPermission("user:create", getAuthSession())
    return resendUserInvite(userId)
  })
}
export function useChangeUserPassword() {
  return useDirectoryWrite(
    "user:reset-password",
    ({ userId, data }: { userId: string; data: ChangePasswordBody }) => {
      const actor = useAuthStore.getState().userInfo
      if (!canResetUserPassword(actor, userId, Boolean(localStorage.getItem("impersonation"))))
        throw new Error("Invalid password target")
      if (actor?.id === userId && !data.oldPassword) throw new Error("Missing old password")
      return changeUserPassword(userId, data)
    },
    false,
  )
}
