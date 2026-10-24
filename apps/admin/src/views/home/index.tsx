import { useAuthStore } from "@/stores/auth"
import { getAuthSession } from "@/services/auth-session"
import {
  useHomeCapabilities,
  useHomeFetchingCount,
  useHomeRefresh,
  useHomeLive,
} from "@/services/hooks/use-home-dashboard"
import { HomeDashboard, resolveHomeView } from "./home-dashboard"
function HomeSession() {
  const query = useHomeCapabilities(),
    fetchingCount = useHomeFetchingCount(),
    refresh = useHomeRefresh()
  useHomeLive()
  return (
    <HomeDashboard state={resolveHomeView(query)} isRefreshing={fetchingCount > 0} onRefresh={() => void refresh()} />
  )
}
export default function HomePage() {
  useAuthStore((state) => state.token)
  return <HomeSession key={getAuthSession()} />
}
