import type { QueryClient } from "@tanstack/react-query"

export interface DashboardTrendParams {
  start: string
  end: string
  granularity: "day" | "hour"
}

export const dashboardQueryKeys = {
  root: (token: string | null) => ["dashboard", token] as const,
  capabilities: (token: string | null) => [...dashboardQueryKeys.root(token), "capabilities"] as const,
  userSummary: (token: string | null) => [...dashboardQueryKeys.root(token), "overview", "users"] as const,
  taskSummary: (token: string | null) => [...dashboardQueryKeys.root(token), "overview", "tasks"] as const,
  workers: (token: string | null) => [...dashboardQueryKeys.root(token), "overview", "workers"] as const,
  errors: (token: string | null) => [...dashboardQueryKeys.root(token), "overview", "errors"] as const,
  trends: (token: string | null, params: DashboardTrendParams) =>
    [...dashboardQueryKeys.root(token), "trends", params] as const,
  activities: (token: string | null, size: number) =>
    [...dashboardQueryKeys.root(token), "activities", { size }] as const,
}

export function invalidateDashboardQueries(client: QueryClient, token: string | null) {
  return client.invalidateQueries({ queryKey: dashboardQueryKeys.root(token) })
}
