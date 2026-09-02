import { useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { fetchUserRoutes } from "@/services/api/route"
import { useAuthStore } from "@/stores/auth"
import { useRouteStore } from "@/stores/route"

export function useUserRoutes() {
  const token = useAuthStore((s) => s.token)
  const setRoutes = useRouteStore((s) => s.setRoutes)
  const query = useQuery({
    queryKey: ["user-routes", token],
    queryFn: fetchUserRoutes,
    enabled: Boolean(token),
    staleTime: Infinity,
  })
  const routes = query.data?.data?.routes
  useEffect(() => {
    if (routes) setRoutes(routes)
  }, [routes, setRoutes])
  return query
}
