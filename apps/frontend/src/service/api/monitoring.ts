import { request } from "../request"

/** 获取 API 监控概览 */
export function fetchApiOverview(params?: Record<string, string | number>) {
  return request<Api.Monitoring.ApiOverview>({
    url: "/system/stats/api/overview",
    method: "get",
    params,
  })
}

/** 获取 API Top N 排行 */
export function fetchApiTop(params?: Record<string, string | number>) {
  return request<Api.Monitoring.ApiTopItem[]>({
    url: "/system/stats/api/top",
    method: "get",
    params,
  })
}

/** 获取 API 请求占比分布 */
export function fetchApiDistribution(params?: Record<string, string | number>) {
  return request<Api.Monitoring.ApiDistributionItem[]>({
    url: "/system/stats/api/distribution",
    method: "get",
    params,
  })
}

/** 获取 API 请求量趋势 */
export function fetchApiTrend(params?: Record<string, string | number>) {
  return request<Api.Monitoring.ApiTrendPoint[]>({
    url: "/system/stats/api/trend",
    method: "get",
    params,
  })
}

/** 获取 API 明细列表 */
export function fetchApiList(params?: Record<string, string | number>) {
  return request<Api.Common.PaginatingQueryRecord<Api.Monitoring.ApiListItem>>({
    url: "/system/stats/api/list",
    method: "get",
    params,
  })
}
