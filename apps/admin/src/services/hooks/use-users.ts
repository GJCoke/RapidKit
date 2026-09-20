import type { UserSearchParams } from "@/services/api/user"
import { fetchUsers, type UserList } from "@/services/api/user"
import { userQueryKeys } from "@/services/user-query-keys"
import { usePaginatedTable } from "@/shared/data-table"
import { useAuthStore } from "@/stores/auth"

export function useUsers(params: Omit<UserSearchParams, "page" | "pageSize">) {
  const token = useAuthStore((state) => state.token)
  return usePaginatedTable({
    queryKey: [...userQueryKeys.lists(token), params],
    queryFn: async ({ page, pageSize }) => {
      const response = await fetchUsers({ ...params, page, pageSize })
      if (response.error) throw response.error
      if (!response.data) throw new Error("User list response is empty")
      return response.data as UserList
    },
  })
}
