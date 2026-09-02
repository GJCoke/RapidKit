import { useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { fetchUserRoutes } from "@/services/api/route"
import { useAuthStore } from "@/stores/auth"
import { useRouteStore } from "@/stores/route"

export function useUserRoutes() {
  const token = useAuthStore((s) => s.token)
  const setRoutes = useRouteStore((s) => s.setRoutes)
  const query = useQuery({
    queryKey: ["user-routes"],
    queryFn: fetchUserRoutes,
    enabled: Boolean(token),
    staleTime: Infinity,
  })
  useEffect(() => {
    if (query.data?.data) setRoutes(query.data.data)
  }, [query.data, setRoutes])
  return query
}
