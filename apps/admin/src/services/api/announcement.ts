import type { ApiRequest, ApiResponse } from "@/typings/service"
import { request } from "@/services/request"

export type AnnouncementQuery = NonNullable<ApiRequest<"/api/v1/admin/notifications", "get", "query">>
export type AnnouncementList = ApiResponse<"/api/v1/admin/notifications">
export type Announcement = AnnouncementList["records"][number]
export type AnnouncementDetail = ApiResponse<"/api/v1/admin/notifications/{message_id}">
export type AnnouncementBody = ApiRequest<"/api/v1/admin/notifications", "post", "body">
export type AnnouncementUpdateBody = ApiRequest<"/api/v1/admin/notifications/{message_id}", "put", "body">
export type AnnouncementAudience = NonNullable<AnnouncementBody["audience"]>[number]
export type AnnouncementAction = NonNullable<AnnouncementBody["action"]>
export type AnnouncementActionTargets = ApiResponse<"/api/v1/admin/notifications/action-targets">
export type AnnouncementActionTarget = AnnouncementActionTargets[number]
export type AnnouncementActionInput = ApiRequest<"/api/v1/admin/notifications/action-preview", "post", "body">
export type AnnouncementActionPreview = ApiResponse<"/api/v1/admin/notifications/action-preview", "post">
export type AnnouncementAudienceBody = ApiRequest<"/api/v1/admin/notifications/audience-preview", "post", "body">
export type AnnouncementAudiencePreview = ApiResponse<"/api/v1/admin/notifications/audience-preview", "post">
export type AnnouncementContentBody = ApiRequest<"/api/v1/admin/notifications/content-preview", "post", "body">
export type AnnouncementContentPreview = ApiResponse<"/api/v1/admin/notifications/content-preview", "post">
export type AnnouncementBannerBody = ApiRequest<"/api/v1/admin/notifications/banner-check", "post", "body">
export type AnnouncementBannerCheck = ApiResponse<"/api/v1/admin/notifications/banner-check", "post">
// The shared helper handles required request bodies; publish accepts an optional body.
export type AnnouncementBannerConfirmation = Pick<
  AnnouncementBody,
  "bannerRevision" | "replaceCurrent" | "replaceScheduled"
>

export function fetchAnnouncements(params?: AnnouncementQuery) {
  return request<AnnouncementList>({ url: "/admin/notifications", method: "get", params })
}
export function fetchAnnouncement(id: string) {
  return request<AnnouncementDetail>({ url: `/admin/notifications/${id}`, method: "get" })
}
export function createAnnouncement(data: AnnouncementBody) {
  return request<ApiResponse<"/api/v1/admin/notifications", "post">>({
    url: "/admin/notifications",
    method: "post",
    data,
  })
}
export function updateAnnouncement(id: string, data: AnnouncementUpdateBody) {
  return request<AnnouncementDetail>({ url: `/admin/notifications/${id}`, method: "put", data })
}
export function deleteAnnouncement(id: string) {
  return request<ApiResponse<"/api/v1/admin/notifications/{message_id}", "delete">>({
    url: `/admin/notifications/${id}`,
    method: "delete",
  })
}
export function publishAnnouncement(id: string, data?: AnnouncementBannerConfirmation) {
  return request<ApiResponse<"/api/v1/admin/notifications/{message_id}/publish", "post">>({
    url: `/admin/notifications/${id}/publish`,
    method: "post",
    data,
  })
}
export function cancelAnnouncement(id: string) {
  return request<ApiResponse<"/api/v1/admin/notifications/{message_id}/cancel", "post">>({
    url: `/admin/notifications/${id}/cancel`,
    method: "post",
  })
}
export function recallAnnouncement(id: string) {
  return request<ApiResponse<"/api/v1/admin/notifications/{message_id}/recall", "post">>({
    url: `/admin/notifications/${id}/recall`,
    method: "post",
  })
}
export function previewAnnouncementAudience(data: AnnouncementAudienceBody) {
  return request<AnnouncementAudiencePreview>({ url: "/admin/notifications/audience-preview", method: "post", data })
}
export function previewAnnouncementContent(data: AnnouncementContentBody) {
  return request<AnnouncementContentPreview>({ url: "/admin/notifications/content-preview", method: "post", data })
}
export function fetchAnnouncementActionTargets() {
  return request<AnnouncementActionTargets>({ url: "/admin/notifications/action-targets", method: "get" })
}
export function previewAnnouncementAction(data: AnnouncementActionInput) {
  return request<AnnouncementActionPreview>({ url: "/admin/notifications/action-preview", method: "post", data })
}
export function checkAnnouncementBanner(data: AnnouncementBannerBody = {}) {
  return request<AnnouncementBannerCheck>({ url: "/admin/notifications/banner-check", method: "post", data })
}
