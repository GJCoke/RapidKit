import { useRef } from "react"
import type { UserSearchParams } from "@/services/api/user"
import { fetchUsers } from "@/services/api/user"
import { userQueryKeys } from "@/services/user-query-keys"
import { usePaginatedTable } from "@/shared/data-table"
import { useAuthStore } from "@/stores/auth"
import { usePermission } from "@/features/auth/permissions"
import { getAuthSession } from "@/services/auth-session"
import { requireDirectoryPermission, requireDirectorySession } from "@/services/user-access"

export function useUsers(params: Omit<UserSearchParams, "page" | "pageSize">) {
  const token = useAuthStore((state) => state.token)
  const restrictedFields = useAuthStore((state) => state.userInfo?.restrictedFields)
  const session = useRef(getAuthSession()).current
  const allowed = usePermission("user:read") && Boolean(token) && session === getAuthSession()
  const table = usePaginatedTable({
    initialPageSize: 20,
    staleTime: 0,
    queryKey: [...userQueryKeys.list(session, params), { restrictedFields }],
    queryFn: async ({ page, pageSize }) => {
      requireDirectoryPermission("user:read", session)
      const response = await fetchUsers({ ...params, page, pageSize })
      requireDirectorySession(session)
      if (response.error) throw response.error
      if (!response.data) throw new Error("User list response is empty")
      return response.data
    },
  })
  return {
    ...table,
    tableData: {
      ...table.tableData,
      records: allowed && !table.query.isPlaceholderData && !table.query.isError ? table.tableData.records : [],
      total: allowed ? table.tableData.total : 0,
    },
  }
}
