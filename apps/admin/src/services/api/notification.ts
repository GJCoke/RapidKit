import type { ApiRequest, ApiResponse } from "@/typings/service"
import { request } from "@/services/request"

export type NotificationQuery = NonNullable<ApiRequest<"/api/v1/notifications", "get", "query">>
export type NotificationPage = ApiResponse<"/api/v1/notifications">
export type NotificationMessage = NotificationPage["items"][number]
export type NotificationUnread = ApiResponse<"/api/v1/notifications/unread-count">
export type TopBanner = ApiResponse<"/api/v1/notifications/top-banner">
export function fetchNotifications(params?: NotificationQuery) {
  return request<NotificationPage>({ url: "/notifications", method: "get", params })
}
export function fetchNotificationUnread() {
  return request<NotificationUnread>({ url: "/notifications/unread-count", method: "get" })
}
export function fetchReadNotification(id: string) {
  return request<ApiResponse<"/api/v1/notifications/{notification_id}/read", "patch">>({
    url: `/notifications/${id}/read`,
    method: "patch",
  })
}
export function fetchReadAllNotifications() {
  return request<ApiResponse<"/api/v1/notifications/read-all", "post">>({
    url: "/notifications/read-all",
    method: "post",
  })
}
export function fetchArchiveNotification(id: string) {
  return request<ApiResponse<"/api/v1/notifications/{notification_id}/archive", "patch">>({
    url: `/notifications/${id}/archive`,
    method: "patch",
  })
}
export function fetchDeleteNotification(id: string) {
  return request<ApiResponse<"/api/v1/notifications/{notification_id}", "delete">>({
    url: `/notifications/${id}`,
    method: "delete",
  })
}
export function fetchTopBanner() {
  return request<TopBanner>({ url: "/notifications/top-banner", method: "get" })
}
