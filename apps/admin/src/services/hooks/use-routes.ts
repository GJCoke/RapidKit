import { useQuery } from "@tanstack/react-query"
import { fetchUserRoutes } from "@/services/api/route"
import { useAuthStore } from "@/stores/auth"
import { getAuthSession } from "@/services/auth-session"

export function useUserRoutes() {
  const token = useAuthStore((s) => s.token)
  return useQuery({
    queryKey: ["user-routes", getAuthSession()],
    queryFn: fetchUserRoutes,
    enabled: Boolean(token),
    staleTime: Infinity,
  })
}
