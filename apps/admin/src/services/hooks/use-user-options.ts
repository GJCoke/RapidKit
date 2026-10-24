import { useRef } from "react"
import { useQuery } from "@tanstack/react-query"
import { fetchDepartmentTree } from "@/services/api/department"
import { fetchAllRoles } from "@/services/api/role"
import { fetchAllUsers, fetchUserDepartmentCounts } from "@/services/api/user"
import { userQueryKeys } from "@/services/user-query-keys"
import { useAuthStore } from "@/stores/auth"
import { usePermission } from "@/features/auth/permissions"
import { getAuthSession } from "@/services/auth-session"
import { requireDirectoryPermission, requireDirectorySession } from "@/services/user-access"
import type { PermissionCode } from "@/typings/permission-codes"

function useDirectoryRead<Data>(
  permission: PermissionCode,
  key: (session: number) => readonly unknown[],
  fetcher: () => Promise<{ data: Data | null; error: unknown }>,
  enabled: boolean,
) {
  const token = useAuthStore((state) => state.token)
  const session = useRef(getAuthSession()).current
  const allowed = usePermission(permission) && Boolean(token) && session === getAuthSession()
  const query = useQuery({
    queryKey: key(session),
    queryFn: async () => {
      requireDirectoryPermission(permission, session)
      const result = await fetcher()
      requireDirectorySession(session)
      if (result.error) throw result.error
      if (result.data === null) throw new Error("Directory options response is empty")
      return result.data
    },
    enabled: allowed && enabled,
    retry: false,
    staleTime: 0,
  })
  return { ...query, data: allowed ? query.data : undefined }
}
export function useRoleOptions(enabled = true) {
  return useDirectoryRead("role:options", userQueryKeys.roles, fetchAllRoles, enabled)
}
export function useDepartmentOptions(enabled = true) {
  return useDirectoryRead("department:read", userQueryKeys.departments, fetchDepartmentTree, enabled)
}
export function useDirectoryUserOptions(enabled = true) {
  return useDirectoryRead("user:options", userQueryKeys.users, fetchAllUsers, enabled)
}
export function useUserDepartmentCounts(enabled = true) {
  return useDirectoryRead("user:read", userQueryKeys.counts, fetchUserDepartmentCounts, enabled)
}
