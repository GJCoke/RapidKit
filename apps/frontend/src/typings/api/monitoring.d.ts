import type { Service } from "@/typings/service"

declare global {
  namespace Api {
    /**
     * namespace Monitoring
     *
     * backend api module: "monitoring"
     */
    namespace Monitoring {
      /** API 监控概览 */
      type ApiOverview = Service.ApiResponse<"/api/v1/system/stats/api/overview">

      /** API 概览查询参数 */
      type ApiOverviewQuery = Service.ApiRequest<"/api/v1/system/stats/api/overview", "get", "query">

      /** API Top 查询参数 */
      type ApiTopQuery = Service.ApiRequest<"/api/v1/system/stats/api/top", "get", "query">

      /** API 分布查询参数 */
      type ApiDistributionQuery = Service.ApiRequest<"/api/v1/system/stats/api/distribution", "get", "query">

      /** API 趋势查询参数 */
      type ApiTrendQuery = Service.ApiRequest<"/api/v1/system/stats/api/trend", "get", "query">

      /** API 明细列表查询参数 */
      type ApiListQuery = Service.ApiRequest<"/api/v1/system/stats/api/list", "get", "query">

      /** API 明细列表分页响应 */
      type ApiListResponse = Service.ApiResponse<"/api/v1/system/stats/api/list">

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
