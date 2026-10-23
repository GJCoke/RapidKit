import { request } from "@/services/request"
import type { ApiRequest, ApiResponse } from "@/typings/service"
export type ScheduleList = ApiResponse<"/api/v1/schedules">
export type ScheduleRecord = ScheduleList["records"][number]
export type ScheduleDetail = ApiResponse<"/api/v1/schedules/{schedule_id}">
export type ScheduleQuery = NonNullable<ApiRequest<"/api/v1/schedules", "get", "query">>
export type ScheduleCreate = ApiRequest<"/api/v1/schedules", "post", "body">
export type ScheduleUpdate = ApiRequest<"/api/v1/schedules/{schedule_id}", "put", "body">
export type ScheduleValue = ScheduleCreate["schedule"]
export type SchedulePreviewBody = ApiRequest<"/api/v1/schedules/preview", "post", "body">
export type SchedulePreview = ApiResponse<"/api/v1/schedules/preview", "post">
export function fetchSchedules(params: ScheduleQuery) {
  return request<ScheduleList>({ url: "/schedules", method: "get", params })
}
export function fetchSchedule(id: string) {
  return request<ScheduleDetail>({ url: `/schedules/${encodeURIComponent(id)}`, method: "get" })
}
export function createSchedule(data: ScheduleCreate) {
  return request<ScheduleDetail>({ url: "/schedules", method: "post", data })
}
export function updateSchedule(id: string, data: ScheduleUpdate) {
  return request<ScheduleDetail>({ url: `/schedules/${encodeURIComponent(id)}`, method: "put", data })
}
export function toggleSchedule(id: string) {
  return request<ApiResponse<"/api/v1/schedules/{schedule_id}/toggle", "patch">>({
    url: `/schedules/${encodeURIComponent(id)}/toggle`,
    method: "patch",
  })
}
export function deleteSchedule(id: string) {
  return request<ApiResponse<"/api/v1/schedules/{schedule_id}", "delete">>({
    url: `/schedules/${encodeURIComponent(id)}`,
    method: "delete",
  })
}
export function previewSchedule(data: SchedulePreviewBody) {
  return request<SchedulePreview>({ url: "/schedules/preview", method: "post", data })
}
