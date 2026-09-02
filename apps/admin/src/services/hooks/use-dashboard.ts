import { useQuery } from "@tanstack/react-query"
import { fetchDashboardCapabilities } from "@/services/api/dashboard"
import { useAuthStore } from "@/stores/auth"

export function useDashboardCapabilities() {
  const token = useAuthStore((s) => s.token)

  return useQuery({
    queryKey: ["dashboard-capabilities"],
    queryFn: fetchDashboardCapabilities,
    enabled: Boolean(token),
  })
}
