import {
  useDashboardCapabilities,
  useDashboardFetchingCount,
  useDashboardRefresh,
} from "@/services/hooks/use-dashboard"
import { HomeDashboard, resolveHomeView } from "./home-dashboard"

export default function HomePage() {
  const query = useDashboardCapabilities()
  const fetchingCount = useDashboardFetchingCount()
  const refreshDashboard = useDashboardRefresh()

  return (
    <HomeDashboard
      state={resolveHomeView(query)}
      isRefreshing={fetchingCount > 0}
      onRefresh={() => void refreshDashboard()}
    />
  )
}
