import { useQuery } from "@tanstack/react-query"
import { fetchRouteExists } from "@/services/api/route"

export function useRouteExistence(routeName: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["route-exists", routeName],
    queryFn: () => fetchRouteExists(routeName as string),
    enabled: enabled && Boolean(routeName),
    staleTime: 60_000,
  })
}
