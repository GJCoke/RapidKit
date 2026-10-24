import { request } from "@/services/request"
import type { ApiRequest, ApiResponse } from "@/typings/service"

export type DashboardCapabilities = ApiResponse<"/api/v1/dashboard/capabilities">
export type OperationsOverview = ApiResponse<"/api/v1/system/stats/operations-overview">
export type OperationsQuery = NonNullable<ApiRequest<"/api/v1/system/stats/operations-overview", "get", "query">>
export type HealthStats = ApiResponse<"/api/v1/system/stats/health">
export type InfrastructureHealth = ApiResponse<"/api/v1/system/stats/infrastructure">
export type BusinessSummary = ApiResponse<"/api/v1/system/stats/business">
export type SystemResources = ApiResponse<"/api/v1/system/stats/resources">
export type InstanceResource = SystemResources["instances"][number]
export type AdminContacts = ApiResponse<"/api/v1/users/admin-contacts">
export type ActivityQuery = NonNullable<ApiRequest<"/api/v1/system/activities", "get", "query">>

export interface UserStatsSummary {
  total: number
  todayNew: number
  yesterdayNew: number
  onlineCount: number
}

export interface TaskStatsSummary {
  total: number
  success: number
  failure: number
  retry: number
  revoked: number
  successRate: number
  avgRuntime: number | null
}

export interface WorkerSummary {
  id: string
  createTime: string
  updateTime: string
  hostname: string
  status: "1" | "2"
  activeQueues: string[]
  concurrency: number
  processedCount: number
  activeTaskCount: number
  loadAverage: Record<string, unknown>
  softwareInfo: Record<string, unknown>
  lastHeartbeat: string | null
}

export interface ErrorStats {
  http5XxCount: number
  bizErrorCount: number
  totalRequests: number
  errorRate: number
  sparkline24H: number[]
}

export interface UserActivityTrend {
  timeBucket: string
  newUsers: number
}

export type ActivityCategory = "task" | "user" | "system" | "alert"
export type ActivityLevel = "info" | "success" | "warning" | "error"

export type ActivityItem = ApiResponse<"/api/v1/system/activities">["items"][number]
export type ActivityPage = ApiResponse<"/api/v1/system/activities">

export interface DashboardOverviewData {
  users: UserStatsSummary
  tasks: TaskStatsSummary
  workers: WorkerSummary[]
  errors: ErrorStats
}

export function fetchDashboardCapabilities(signal?: AbortSignal) {
  return request<DashboardCapabilities>({ url: "/dashboard/capabilities", method: "get", signal })
}

export function fetchUserStatsSummary() {
  return request<UserStatsSummary>({ url: "/users/stats/summary", method: "get" })
}

export function fetchTaskStatsSummary() {
  return request<TaskStatsSummary>({ url: "/tasks/stats/summary", method: "get", params: { days: 1 } })
}

export function fetchAllWorkers() {
  return request<WorkerSummary[]>({ url: "/workers/all", method: "get" })
}

export function fetchErrorStats() {
  return request<ErrorStats>({ url: "/system/stats/errors", method: "get" })
}

export function fetchUserActivityTrend(params: { start: string; end: string; granularity: "day" | "hour" }) {
  return request<UserActivityTrend[]>({ url: "/users/stats/trend", method: "get", params })
}

export function fetchActivities(params: ActivityQuery, signal?: AbortSignal) {
  return request<ActivityPage>({
    url: "/system/activities",
    method: "get",
    params,
    paramsSerializer: { indexes: null },
    signal,
  })
}

export function fetchOperationsOverview(params: OperationsQuery = { range: "7d" }, signal?: AbortSignal) {
  return request<OperationsOverview>({ url: "/system/stats/operations-overview", method: "get", params, signal })
}
export function fetchHealthStats(signal?: AbortSignal) {
  return request<HealthStats>({ url: "/system/stats/health", method: "get", signal })
}
export function fetchInfrastructureHealth(signal?: AbortSignal) {
  return request<InfrastructureHealth>({ url: "/system/stats/infrastructure", method: "get", signal })
}
export function fetchBusinessSummary(signal?: AbortSignal) {
  return request<BusinessSummary>({ url: "/system/stats/business", method: "get", signal })
}
export function fetchSystemResources(instance?: string, signal?: AbortSignal) {
  return request<SystemResources>({ url: "/system/stats/resources", method: "get", params: { instance }, signal })
}
export function fetchAdminContacts(signal?: AbortSignal) {
  return request<AdminContacts>({ url: "/users/admin-contacts", method: "get", signal })
}
