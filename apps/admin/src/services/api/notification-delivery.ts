import type { ApiRequest, ApiResponse } from "@/typings/service"
import { request } from "@/services/request"
export type DeliveryQuery = NonNullable<ApiRequest<"/api/v1/admin/notification-deliveries", "get", "query">>
export type DeliveryPage = ApiResponse<"/api/v1/admin/notification-deliveries">
export type Delivery = DeliveryPage["records"][number]
export type DeliveryStatus = Delivery["status"]
export type DeliveryRecipient = NonNullable<Delivery["recipient"]>
export type DeliveryMessage = NonNullable<Delivery["message"]>
export type DeliverySummary = ApiResponse<"/api/v1/admin/notification-deliveries/{message_id}/summary">
export type DeliveryRetry = ApiResponse<"/api/v1/admin/notification-deliveries/{message_id}/retry-failed", "post">
export function fetchNotificationDeliveries(params: DeliveryQuery) {
  return request<DeliveryPage>({ url: "/admin/notification-deliveries", method: "get", params })
}
export function fetchDeliverySummary(id: string) {
  return request<DeliverySummary>({ url: `/admin/notification-deliveries/${id}/summary`, method: "get" })
}
export function retryFailedDeliveries(id: string) {
  return request<DeliveryRetry>({ url: `/admin/notification-deliveries/${id}/retry-failed`, method: "post" })
}
