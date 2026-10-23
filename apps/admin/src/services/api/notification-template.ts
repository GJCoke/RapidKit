import type { ApiRequest, ApiResponse } from "@/typings/service"
import { request } from "@/services/request"

export type NotificationTemplateQuery = NonNullable<ApiRequest<"/api/v1/admin/notification-templates", "get", "query">>
export type NotificationTemplateList = ApiResponse<"/api/v1/admin/notification-templates">
export type NotificationTemplate = NotificationTemplateList["records"][number]

export function fetchNotificationTemplates(params: NotificationTemplateQuery) {
  return request<NotificationTemplateList>({ url: "/admin/notification-templates", method: "get", params })
}
