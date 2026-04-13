declare global {
  namespace Api {
    /**
     * namespace Monitoring
     *
     * backend api module: "monitoring"
     */
    namespace Monitoring {
      /** API 监控概览 */
      type ApiOverview = {
        totalRequests: number
        totalErrors: number
        avgErrorRate: number
        avgMs: number
        busiestPath: string | null
        busiestMethod: string | null
        busiestCount: number
      }

      /** API 排行条目 */
      type ApiTopItem = {
        path: string
        method: string
        requestCount: number
        errorCount: number
        errorRate: number
        avgMs: number
        p95Ms: number
      }

      /** API 请求占比分布 */
      type ApiDistributionItem = {
        path: string
        method: string
        requestCount: number
        percentage: number
      }

      /** API 趋势数据点 */
      type ApiTrendPoint = {
        timeBucket: string
        requestCount: number
        errorCount: number
      }

      /** API 明细列表条目 */
      type ApiListItem = {
        path: string
        method: string
        requestCount: number
        errorCount: number
        errorRate: number
        avgMs: number
        p95Ms: number
      }

      /** 时间范围 */
      type TimeRange = "1h" | "6h" | "24h" | "7d"

      /** Socket.IO dashboard:api_stats 增量事件 */
      type ApiStatsEvent = {
        deltaRequests: number
        deltaErrors: number
        errorRate: number
        topFailures: ApiTopItem[]
      }
    }
  }
}

export {}
