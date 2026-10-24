import type { QueryClient } from "@tanstack/react-query"

export interface DashboardTrendParams {
  start: string
  end: string
  granularity: "day" | "hour"
}

export const dashboardQueryKeys = {
  root: (token: string | number | null) => ["dashboard", token] as const,
  capabilities: (token: string | number | null) => [...dashboardQueryKeys.root(token), "capabilities"] as const,
  userSummary: (token: string | number | null) => [...dashboardQueryKeys.root(token), "overview", "users"] as const,
  taskSummary: (token: string | number | null) => [...dashboardQueryKeys.root(token), "overview", "tasks"] as const,
  workers: (token: string | number | null) => [...dashboardQueryKeys.root(token), "overview", "workers"] as const,
  errors: (token: string | number | null) => [...dashboardQueryKeys.root(token), "overview", "errors"] as const,
  trends: (token: string | number | null, params: DashboardTrendParams) =>
    [...dashboardQueryKeys.root(token), "trends", params] as const,
  activities: (token: string | number | null, size: number) =>
    [...dashboardQueryKeys.root(token), "activities", { size }] as const,
}

export function invalidateDashboardQueries(client: QueryClient, token: string | number | null) {
  return client.invalidateQueries({ queryKey: dashboardQueryKeys.root(token) })
}
