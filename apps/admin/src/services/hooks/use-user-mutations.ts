import { useMutation, useQueryClient } from "@tanstack/react-query"
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
import { userQueryKeys } from "@/services/user-query-keys"
import { useAuthStore } from "@/stores/auth"

async function unwrap<T>(request: Promise<{ data: T | null; error: unknown }>) {
  const result = await request
  if (result.error) throw result.error
  if (!result.data) throw new Error("Mutation response is empty")
  return result.data
}
export function useCreateUser() {
  const token = useAuthStore((s) => s.token)
  const client = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateUserBody) => unwrap(createUser(data)),
    onSuccess: () => client.invalidateQueries({ queryKey: userQueryKeys.lists(token) }),
  })
}
export function useUpdateUser() {
  const token = useAuthStore((s) => s.token)
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, data }: { userId: string; data: UpdateUserBody }) => unwrap(updateUser(userId, data)),
    onSuccess: (user) =>
      Promise.all([
        client.invalidateQueries({ queryKey: userQueryKeys.lists(token) }),
        client.invalidateQueries({ queryKey: userQueryKeys.detail(token, user.id) }),
      ]),
  })
}
export function useDeleteUsers() {
  const token = useAuthStore((s) => s.token)
  const client = useQueryClient()
  return useMutation({
    mutationFn: (ids: string[]) => (ids.length === 1 ? unwrap(deleteUser(ids[0])) : unwrap(batchDeleteUsers({ ids }))),
    onSuccess: () => client.invalidateQueries({ queryKey: userQueryKeys.lists(token) }),
  })
}
export function useResendUserInvite() {
  return useMutation({ mutationFn: (userId: string) => unwrap(resendUserInvite(userId)) })
}
export function useChangeUserPassword() {
  return useMutation({
    mutationFn: ({ userId, data }: { userId: string; data: ChangePasswordBody }) =>
      unwrap(changeUserPassword(userId, data)),
  })
}
