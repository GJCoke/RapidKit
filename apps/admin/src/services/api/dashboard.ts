import { request } from "@/services/request"

export interface DashboardCapabilities {
  allowedModules: string[]
  revision: string
}

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

export interface ActivityItem {
  id: string
  createTime: string
  updateTime: string
  category: ActivityCategory
  eventCode: string
  level: ActivityLevel
  actorId: string | null
  actorName: string | null
  subjectType: string
  subjectId: string | null
  subjectName: string | null
  titleKey: string
  titleParams: Record<string, unknown>
  descriptionKey: string | null
  descriptionParams: Record<string, unknown>
  metadata: Record<string, unknown>
  occurredAt: string
}

export interface ActivityPage {
  items: ActivityItem[]
  nextCursor: string | null
  size: number
}

export interface DashboardOverviewData {
  users: UserStatsSummary
  tasks: TaskStatsSummary
  workers: WorkerSummary[]
  errors: ErrorStats
}

export function fetchDashboardCapabilities() {
  return request<DashboardCapabilities>({ url: "/dashboard/capabilities", method: "get" })
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

export function fetchActivities(params: { size: number }) {
  return request<ActivityPage>({ url: "/system/activities", method: "get", params })
}
