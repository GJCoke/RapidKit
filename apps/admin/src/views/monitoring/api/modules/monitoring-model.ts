import { z } from "zod"
import type { ApiListQuery, ApiOverview } from "@/services/api/api-monitoring"
export const monitoringRanges = ["1h", "6h", "24h", "7d"] as const
export type MonitoringRange = (typeof monitoringRanges)[number]
export const monitoringMethods = ["GET", "POST", "PUT", "DELETE", "PATCH"] as const
export type MonitoringMethod = (typeof monitoringMethods)[number]
export const monitoringSortFields = {
  requestCount: "request_count",
  errorCount: "error_count",
  errorRate: "error_rate",
  avgMs: "avg_ms",
  p95Ms: "p95_ms",
} as const
export type MonitoringSortField = keyof typeof monitoringSortFields
export type MonitoringSort = { field: MonitoringSortField; order: "asc" | "desc" } | null
const apiStatsEvent = z.object({
  deltaRequests: z.number().int().nonnegative().finite(),
  deltaErrors: z.number().int().nonnegative().finite(),
  errorRate: z.number().min(0).max(100).finite(),
})
export type ApiStatsEvent = z.infer<typeof apiStatsEvent>
export function parseApiStats(value: unknown) {
  const parsed = apiStatsEvent.safeParse(value)
  return parsed.success ? parsed.data : null
}
export function applyApiStats(overview: ApiOverview, event: ApiStatsEvent): ApiOverview {
  return {
    ...overview,
    totalRequests: overview.totalRequests + event.deltaRequests,
    totalErrors: overview.totalErrors + event.deltaErrors,
    avgErrorRate: event.errorRate,
  }
}
export function nextApiSort(current: MonitoringSort, field: MonitoringSortField): MonitoringSort {
  if (current?.field !== field) return { field, order: "desc" }
  return current.order === "desc" ? { field, order: "asc" } : null
}
export function monitoringListQuery({
  range,
  page,
  pageSize,
  keyword,
  sort,
}: {
  range: MonitoringRange
  page: number
  pageSize: number
  keyword: string
  sort: MonitoringSort
}): ApiListQuery {
  return {
    range,
    page,
    pageSize,
    ...(keyword ? { keyword } : {}),
    sortBy: sort ? monitoringSortFields[sort.field] : "request_count",
    sortOrder: sort?.order ?? "desc",
  }
}
