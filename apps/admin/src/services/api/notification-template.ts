import type { ApiRequest, ApiResponse } from "@/typings/service"
import { request } from "@/services/request"

export type NotificationTemplateQuery = NonNullable<ApiRequest<"/api/v1/admin/notification-templates", "get", "query">>
export type NotificationTemplateList = ApiResponse<"/api/v1/admin/notification-templates">
export type NotificationTemplate = NotificationTemplateList["records"][number]

export function fetchNotificationTemplates(params: NotificationTemplateQuery) {
  return request<NotificationTemplateList>({ url: "/admin/notification-templates", method: "get", params })
}

export type CreateNotificationTemplateBody = ApiRequest<"/api/v1/admin/notification-templates", "post", "body">
export type UpdateNotificationTemplateBody = ApiRequest<
  "/api/v1/admin/notification-templates/{template_id}",
  "put",
  "body"
>
export function createNotificationTemplate(data: CreateNotificationTemplateBody) {
  return request<NotificationTemplate>({ url: "/admin/notification-templates", method: "post", data })
}
export function updateNotificationTemplate(id: string, data: UpdateNotificationTemplateBody) {
  return request<NotificationTemplate>({ url: `/admin/notification-templates/${id}`, method: "put", data })
}
export function deleteNotificationTemplate(id: string) {
  return request<null>({ url: `/admin/notification-templates/${id}`, method: "delete" })
}
