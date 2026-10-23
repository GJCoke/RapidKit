import { request } from "@/services/request"
import type { ApiRequest, ApiResponse } from "@/typings/service"
export type ApiOverview = ApiResponse<"/api/v1/system/stats/api/overview">
export type ApiRangeQuery = NonNullable<ApiRequest<"/api/v1/system/stats/api/overview", "get", "query">>
export type ApiDistribution = ApiResponse<"/api/v1/system/stats/api/distribution">
export type ApiTrend = ApiResponse<"/api/v1/system/stats/api/trend">
export type ApiTop = ApiResponse<"/api/v1/system/stats/api/top">
export type ApiTopQuery = NonNullable<ApiRequest<"/api/v1/system/stats/api/top", "get", "query">>
export type ApiList = ApiResponse<"/api/v1/system/stats/api/list">
export type ApiListQuery = NonNullable<ApiRequest<"/api/v1/system/stats/api/list", "get", "query">>
export type ApiMetric = ApiList["records"][number]
export function fetchApiOverview(params: ApiRangeQuery, signal?: AbortSignal) {
  return request<ApiOverview>({ url: "/system/stats/api/overview", method: "get", params, signal })
}
export function fetchApiDistribution(params: ApiRangeQuery, signal?: AbortSignal) {
  return request<ApiDistribution>({ url: "/system/stats/api/distribution", method: "get", params, signal })
}
export function fetchApiTrend(params: ApiRangeQuery, signal?: AbortSignal) {
  return request<ApiTrend>({ url: "/system/stats/api/trend", method: "get", params, signal })
}
export function fetchApiTop(params: ApiTopQuery, signal?: AbortSignal) {
  return request<ApiTop>({ url: "/system/stats/api/top", method: "get", params, signal })
}
export function fetchApiList(params: ApiListQuery, signal?: AbortSignal) {
  return request<ApiList>({ url: "/system/stats/api/list", method: "get", params, signal })
}
