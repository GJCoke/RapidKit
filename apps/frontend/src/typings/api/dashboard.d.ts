import type { Service } from "@/typings/service"

declare global {
  namespace Api {
    /**
     * namespace Dashboard
     *
     * backend api module: "system"
     */
    namespace Dashboard {
      /** 当前用户可访问的首页模块 */
      type Capabilities = Service.ApiResponse<"/api/v1/dashboard/capabilities">

      /** 服务器资源统计 */
      type ResourceStats = {
        cpuPercent: number
        memoryUsed: number
        memoryTotal: number
        memoryPercent: number
        diskUsed: number
        diskTotal: number
        diskPercent: number
        netSent: number
        netRecv: number
      }

      /** 单实例资源统计（带 hostname） */
      type InstanceResourceStats = ResourceStats & {
        hostname: string
      }

      /** 多实例资源汇总 */
      type MultiResourceStats = Service.ApiResponse<"/api/v1/system/stats/resources">

      /** 错误统计 */
      type ErrorStats = Service.ApiResponse<"/api/v1/system/stats/errors">

      /** 应用健康统计 */
      type HealthStats = Service.ApiResponse<"/api/v1/system/stats/health">

      /** 基础设施健康状态 */
      type InfrastructureHealth = Service.ApiResponse<"/api/v1/system/stats/infrastructure">

      /** 业务数据汇总 */
      type BusinessSummary = Service.ApiResponse<"/api/v1/system/stats/business">

      type ActivityCategory = "task" | "user" | "system" | "alert"
      type ActivityLevel = "info" | "success" | "warning" | "error"

      /** Curated dashboard activity item. */
      type ActivityItem = {
        id: string
        category: ActivityCategory
        eventCode: string
        level: ActivityLevel
        actorId: string | null
        actorName: string | null
        subjectType: string
        subjectId: string | null
        subjectName: string | null
        titleKey: string
        titleParams: Record<string, string | number | null>
        descriptionKey: string | null
        descriptionParams: Record<string, string | number | null>
        metadata: Record<string, unknown>
        occurredAt: string
      }

      type ActivityQuery = {
        categories?: ActivityCategory[]
        levels?: ActivityLevel[]
        cursor?: string
        size?: number
      }
      type ActivityPage = { items: ActivityItem[]; nextCursor: string | null; size: number }

      /** 用户统计摘要 */
      type UserStatsSummary = Service.ApiResponse<"/api/v1/users/stats/summary">

      /** 用户活跃趋势 */
      type UserActivityTrend = {
        timeBucket: string
        newUsers: number
      }

      /** 用户活跃趋势查询参数 */
      type UserActivityTrendQuery = Service.ApiRequest<"/api/v1/users/stats/trend", "get", "query">

      /** 用户活跃趋势列表 */
      type UserActivityTrendList = Service.ApiResponse<"/api/v1/users/stats/trend">

      // ==================== Socket.IO Event Payloads ====================

      /** dashboard:online_users event */
      type OnlineUsersEvent = {
        count: number
      }

      /** dashboard:worker_status event */
      type DashboardWorkerStatusEvent = {
        hostname: string
        status: Api.Worker.WorkerStatus
        concurrency: number
        activeTaskCount: number
        activeQueues: string[]
        lastHeartbeat: string
        processedCount: number
      }

      /** dashboard:task_completed event */
      type TaskCompletedEvent = {
        taskId: string
        taskName: string
        status: Api.Worker.TaskStatus
        workerHostname: string
        runtime: number | null
        finishedAt: string
      }

      /** dashboard:error_stats event */
      type ErrorStatsEvent = {
        http5xxCount: number
        bizErrorCount: number
        totalRequests: number
        errorRate: number
      }

      /** dashboard:resources event */
      type ResourcesEvent = {
        hostname: string
        cpuPercent: number
        memoryUsed: number
        memoryTotal: number
        memoryPercent: number
        diskUsed: number
        diskTotal: number
        diskPercent: number
        netSent: number
        netRecv: number
      }

      /** dashboard:activity.created event */
      type ActivityCreatedEvent = ActivityItem
    }
  }
}
