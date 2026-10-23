import type { ApiRequest, ApiResponse } from "@/typings/service"
import { request } from "@/services/request"
export type AuditLogQuery = ApiRequest<"/api/v1/system/audit-logs/paginate", "get", "query">
export type AuditLogList = ApiResponse<"/api/v1/system/audit-logs/paginate">
export type AuditLog = AuditLogList["records"][number]
export type AuditDetail = NonNullable<ApiResponse<"/api/v1/system/audit-logs/{item_id}">>
export type AuditCatalog = ApiResponse<"/api/v1/system/audit-logs/catalog">
export type AuditActorsQuery = ApiRequest<"/api/v1/system/audit-logs/actors", "get", "query">
export type AuditActors = ApiResponse<"/api/v1/system/audit-logs/actors">
export type AuditTargets = ApiResponse<"/api/v1/system/audit-logs/{item_id}/targets">
export type AuditTargetsQuery = ApiRequest<"/api/v1/system/audit-logs/{item_id}/targets", "get", "query">
export function fetchAuditLogs(params?: AuditLogQuery) {
  return request<AuditLogList>({ url: "/system/audit-logs/paginate", method: "get", params })
}
export function fetchAuditDetail(id: string) {
  return request<AuditDetail | null>({ url: `/system/audit-logs/${id}`, method: "get" })
}
export function fetchAuditCatalog() {
  return request<AuditCatalog>({ url: "/system/audit-logs/catalog", method: "get" })
}
export function fetchAuditActors(params?: AuditActorsQuery) {
  return request<AuditActors>({ url: "/system/audit-logs/actors", method: "get", params })
}
export function fetchAuditTargets(id: string, params?: AuditTargetsQuery) {
  return request<AuditTargets>({ url: `/system/audit-logs/${id}/targets`, method: "get", params })
}
