import { useMutation, useQueryClient } from "@tanstack/react-query"
import { hasPermission } from "@/features/auth/permissions"
import { useAuthStore } from "@/stores/auth"
import { getAuthSession } from "@/services/auth-session"
import {
  batchDeleteRoles,
  createRole,
  deleteRole,
  fetchRoles,
  updateRole,
  type CreateRoleBody,
  type RoleSearchParams,
  type UpdateRoleBody,
} from "@/services/api/role"
import { usePaginatedTable } from "@/shared/data-table"
import type { PermissionCode } from "@/typings/permission-codes"

export const roleQueryKeys = { all: (session: number) => ["roles", session] as const }
export async function unwrapRoleRequest<T>(request: Promise<{ data: T | null; error: unknown }>) {
  const result = await request
  if (result.error) throw result.error
  if (result.data === null) throw new Error("Role response is empty")
  return result.data
}
export function requireRolePermission(code: PermissionCode, session: number) {
  if (session !== getAuthSession()) throw new Error("Role editor session changed")
  const state = useAuthStore.getState()
  if (!state.token || !hasPermission(state.userInfo, code)) throw new Error("Role operation permission revoked")
}
export function useRoles(params: Omit<RoleSearchParams, "page" | "pageSize">) {
  useAuthStore((s) => s.token)
  const table = usePaginatedTable({
    staleTime: 0,
    queryKey: [...roleQueryKeys.all(getAuthSession()), params],
    queryFn: ({ page, pageSize }) => unwrapRoleRequest(fetchRoles({ ...params, page, pageSize })),
  })
  return {
    ...table,
    tableData: {
      ...table.tableData,
      records:
        table.query.fetchStatus === "idle" && !table.query.isPlaceholderData && !table.query.isError
          ? table.tableData.records
          : [],
    },
  }
}
export function useRoleMutations() {
  const client = useQueryClient()
  const session = getAuthSession()
  const invalidate = async () => {
    if (session !== getAuthSession()) return
    await Promise.all([
      client.invalidateQueries({ queryKey: roleQueryKeys.all(session) }),
      client.invalidateQueries({ queryKey: ["users"] }),
    ])
  }
  const create = useMutation({
    mutationFn: (data: CreateRoleBody) => {
      requireRolePermission("role:create", session)
      return unwrapRoleRequest(createRole(data))
    },
    onSuccess: invalidate,
  })
  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateRoleBody }) => {
      requireRolePermission("role:update", session)
      return unwrapRoleRequest(updateRole(id, data))
    },
    onSuccess: invalidate,
  })
  const deletion = useMutation({
    mutationFn: (ids: string[]) => {
      requireRolePermission("role:delete", session)
      return ids.length === 1 ? unwrapRoleRequest(deleteRole(ids[0])) : unwrapRoleRequest(batchDeleteRoles({ ids }))
    },
    onSuccess: invalidate,
  })
  return { create, update, deletion }
}
