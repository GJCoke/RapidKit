import { request } from "../request"

/** 获取服务器资源统计（多实例） */
export function fetchSystemResources(instance?: string) {
  return request<Api.Dashboard.MultiResourceStats>({
    url: "/system/stats/resources",
    method: "get",
    params: instance ? { instance } : undefined,
  })
}

/** 获取错误统计 */
export function fetchErrorStats() {
  return request<Api.Dashboard.ErrorStats>({
    url: "/system/stats/errors",
    method: "get",
  })
}

/** 获取应用健康统计 */
export function fetchHealthStats() {
  return request<Api.Dashboard.HealthStats>({
    url: "/system/stats/health",
    method: "get",
  })
}

/** 获取基础设施健康状态 */
export function fetchInfrastructureHealth() {
  return request<Api.Dashboard.InfrastructureHealth>({
    url: "/system/stats/infrastructure",
    method: "get",
  })
}

/** 获取业务数据汇总 */
export function fetchBusinessSummary() {
  return request<Api.Dashboard.BusinessSummary>({
    url: "/system/stats/business",
    method: "get",
  })
}

/** 获取最近系统活动 */
export function fetchActivities() {
  return request<Api.Dashboard.ActivityItem[]>({
    url: "/system/activities",
    method: "get",
  })
}

/** 获取用户统计摘要 */
export function fetchUserStatsSummary() {
  return request<Api.Dashboard.UserStatsSummary>({
    url: "/users/stats/summary",
    method: "get",
  })
}

/** 获取用户活跃趋势 */
export function fetchUserActivityTrend(params: { start: string; end: string; granularity: string }) {
  return request<Api.Dashboard.UserActivityTrend[]>({
    url: "/users/stats/trend",
    method: "get",
    params,
  })
}
