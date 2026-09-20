import { useQuery } from "@tanstack/react-query"
import { fetchDepartmentTree } from "@/services/api/department"
import { fetchAllRoles } from "@/services/api/role"
import { userQueryKeys } from "@/services/user-query-keys"
import { useAuthStore } from "@/stores/auth"

async function unwrap<T>(request: Promise<{ data: T | null; error: unknown }>) {
  const result = await request
  if (result.error) throw result.error
  if (!result.data) throw new Error("Option response is empty")
  return result.data
}
export function useRoleOptions() {
  const token = useAuthStore((s) => s.token)
  return useQuery({
    queryKey: userQueryKeys.roles(token),
    queryFn: () => unwrap(fetchAllRoles()),
    enabled: Boolean(token),
  })
}
export function useDepartmentOptions() {
  const token = useAuthStore((s) => s.token)
  return useQuery({
    queryKey: userQueryKeys.departments(token),
    queryFn: () => unwrap(fetchDepartmentTree()),
    enabled: Boolean(token),
  })
}
