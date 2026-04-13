declare global {
  namespace Api {
    /**
     * namespace Dashboard
     *
     * backend api module: "system"
     */
    namespace Dashboard {
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
      type MultiResourceStats = {
        instances: InstanceResourceStats[]
        summary: InstanceResourceStats
      }

      /** 错误统计 */
      type ErrorStats = {
        http5xxCount: number
        bizErrorCount: number
        totalRequests: number
        errorRate: number
        sparkline24h: number[]
      }

      /** 应用健康统计 */
      type HealthStats = {
        qps: number
        p50Ms: number
        p95Ms: number
        http5xx1h: number
        bizErrors1h: number
        wsConnections: number
      }

      /** 单个服务健康状态 */
      type ServiceHealth = {
        status: "healthy" | "degraded" | "down"
        latencyMs: number
        details: Record<string, any> | null
      }

      /** 基础设施健康状态 */
      type InfrastructureHealth = {
        pg: ServiceHealth
        redis: ServiceHealth
        minio: ServiceHealth
      }

      /** 业务数据汇总 */
      type BusinessSummary = {
        roles: number
        menus: number
        routers: number
        scripts: number
        schedules: number
      }

      /** 活动日志 */
      type ActivityItem = {
        id: string
        eventType: string
        params: Record<string, string>
        detail: string | null
        sourceIp: string | null
        createTime: string
      }

      /** 用户统计摘要 */
      type UserStatsSummary = {
        total: number
        todayNew: number
        yesterdayNew: number
        onlineCount: number
      }

      /** 用户活跃趋势 */
      type UserActivityTrend = {
        timeBucket: string
        newUsers: number
      }

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

      /** dashboard:resources event (携带 hostname) */
      type ResourcesEvent = InstanceResourceStats

      /** dashboard:activity event (same as ActivityItem) */
      type ActivityEvent = ActivityItem
    }
  }
}

export {}
