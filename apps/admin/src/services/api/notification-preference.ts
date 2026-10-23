import type { ApiRequest, ApiResponse } from "@/typings/service"
import { request } from "@/services/request"
export type NotificationPreferences = ApiResponse<"/api/v1/notification-preferences">
export type NotificationPreference = NotificationPreferences[number]
export type PreferenceUpdate = ApiRequest<"/api/v1/notification-preferences/{category}", "put", "body">
export function fetchNotificationPreferences() {
  return request<NotificationPreferences>({ url: "/notification-preferences", method: "get" })
}
export function updateNotificationPreference(category: string, data: PreferenceUpdate) {
  return request<NotificationPreference>({
    url: `/notification-preferences/${encodeURIComponent(category)}`,
    method: "put",
    data,
  })
}
