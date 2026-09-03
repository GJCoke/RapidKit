import { useCallback } from "react"
import { useIsFetching, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  fetchActivities,
  fetchAllWorkers,
  fetchDashboardCapabilities,
  fetchErrorStats,
  fetchTaskStatsSummary,
  fetchUserActivityTrend,
  fetchUserStatsSummary,
} from "@/services/api/dashboard"
import {
  dashboardQueryKeys,
  invalidateDashboardQueries,
  type DashboardTrendParams,
} from "@/services/dashboard-query-keys"
import { useAuthStore } from "@/stores/auth"

export function useDashboardCapabilities() {
  const token = useAuthStore((s) => s.token)

  return useQuery({
    queryKey: dashboardQueryKeys.capabilities(token),
    queryFn: fetchDashboardCapabilities,
    enabled: Boolean(token),
  })
}

export function useDashboardUserSummary() {
  const token = useAuthStore((s) => s.token)
  return useQuery({
    queryKey: dashboardQueryKeys.userSummary(token),
    queryFn: fetchUserStatsSummary,
    enabled: Boolean(token),
  })
}

export function useDashboardTaskSummary() {
  const token = useAuthStore((s) => s.token)
  return useQuery({
    queryKey: dashboardQueryKeys.taskSummary(token),
    queryFn: fetchTaskStatsSummary,
    enabled: Boolean(token),
  })
}

export function useDashboardWorkers() {
  const token = useAuthStore((s) => s.token)
  return useQuery({
    queryKey: dashboardQueryKeys.workers(token),
    queryFn: fetchAllWorkers,
    enabled: Boolean(token),
  })
}

export function useDashboardErrorStats() {
  const token = useAuthStore((s) => s.token)
  return useQuery({
    queryKey: dashboardQueryKeys.errors(token),
    queryFn: fetchErrorStats,
    enabled: Boolean(token),
  })
}

export function useDashboardTrends(params: DashboardTrendParams) {
  const token = useAuthStore((s) => s.token)
  return useQuery({
    queryKey: dashboardQueryKeys.trends(token, params),
    queryFn: () => fetchUserActivityTrend(params),
    enabled: Boolean(token),
  })
}

export function useDashboardActivities(size = 20) {
  const token = useAuthStore((s) => s.token)
  return useQuery({
    queryKey: dashboardQueryKeys.activities(token, size),
    queryFn: () => fetchActivities({ size }),
    enabled: Boolean(token),
  })
}

export function useDashboardFetchingCount() {
  const token = useAuthStore((s) => s.token)
  return useIsFetching({ queryKey: dashboardQueryKeys.root(token) })
}

export function useDashboardRefresh() {
  const token = useAuthStore((s) => s.token)
  const client = useQueryClient()

  return useCallback(() => invalidateDashboardQueries(client, token), [client, token])
}
