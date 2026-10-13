import { request } from "../request"

export function fetchGetNotifications(params?: Api.Notification.InboxQuery) {
  return request<Api.Notification.InboxPage>({ url: "/notifications", method: "get", params })
}

export function fetchGetUnreadCount() {
  return request<Api.Notification.UnreadCount>({ url: "/notifications/unread-count", method: "get" })
}

export function fetchGetNotification(id: string) {
  return request<Api.Notification.Message>({ url: `/notifications/${id}`, method: "get" })
}

export function fetchReadNotification(id: string) {
  return request<Api.Notification.MarkReadResponse>({ url: `/notifications/${id}/read`, method: "patch" })
}

export function fetchReadAllNotifications() {
  return request<Api.Notification.MarkAllReadResponse>({ url: "/notifications/read-all", method: "post" })
}

export function fetchArchiveNotification(id: string) {
  return request<Api.Notification.ArchiveResponse>({ url: `/notifications/${id}/archive`, method: "patch" })
}

export function fetchDeleteNotification(id: string) {
  return request<Api.Notification.DeleteResponse>({ url: `/notifications/${id}`, method: "delete" })
}

export function fetchGetNotificationPreferences() {
  return request<Api.Notification.PreferenceItem[]>({ url: "/notification-preferences", method: "get" })
}

export function fetchUpdateNotificationPreference(category: string, enabled: boolean) {
  return request<Api.Notification.PreferenceItem>({
    url: `/notification-preferences/${category}`,
    method: "put",
    data: { enabled },
  })
}

export function fetchGetNotificationTemplates(params: Api.Notification.TemplateListQuery) {
  return request<Api.Notification.TemplateList>({ url: "/admin/notification-templates", method: "get", params })
}

export function fetchCreateNotificationTemplate(data: Api.Notification.TemplateCreate) {
  return request<Api.Notification.Template>({ url: "/admin/notification-templates", method: "post", data })
}

export function fetchUpdateNotificationTemplate(id: string, data: Api.Notification.TemplateUpdate) {
  return request<Api.Notification.Template>({ url: `/admin/notification-templates/${id}`, method: "put", data })
}

export function fetchDeleteNotificationTemplate(id: string) {
  return request<null>({ url: `/admin/notification-templates/${id}`, method: "delete" })
}

export function fetchGetAnnouncements(params: Api.Notification.AnnouncementListQuery) {
  return request<Api.Notification.AnnouncementList>({ url: "/admin/notifications", method: "get", params })
}

export function fetchCreateAnnouncement(data: Api.Notification.AnnouncementCreate) {
  return request<{ messageId: string }>({ url: "/admin/notifications", method: "post", data })
}

export function fetchGetAnnouncement(messageId: string) {
  return request<Api.Notification.AnnouncementDetail>({ url: `/admin/notifications/${messageId}`, method: "get" })
}

export function fetchUpdateAnnouncement(messageId: string, data: Api.Notification.AnnouncementUpdate) {
  return request<Api.Notification.AnnouncementDetail>({
    url: `/admin/notifications/${messageId}`,
    method: "put",
    data,
  })
}

export function fetchDeleteAnnouncement(messageId: string) {
  return request<null>({ url: `/admin/notifications/${messageId}`, method: "delete" })
}

export function fetchPreviewAudience(messageId: string, audience: Api.Notification.AudienceRule[]) {
  return request<Api.Notification.AudiencePreview>({
    url: `/admin/notifications/${messageId}/audience-preview`,
    method: "post",
    data: { audience },
  })
}

/** Estimate an unsaved audience without persisting or scheduling an announcement. */
export function fetchPreviewUnsavedAudience(data: Api.Notification.AudiencePreviewBody) {
  return request<Api.Notification.UnsavedAudiencePreview>({
    url: "/admin/notifications/audience-preview",
    method: "post",
    data,
  })
}

export function fetchPublishAnnouncement(messageId: string, data?: Api.Notification.BannerConfirmation) {
  return request<{ recipientCount: number }>({ url: `/admin/notifications/${messageId}/publish`, method: "post", data })
}

/** Render for one recipient without saving or sending the announcement. */
export function fetchPreviewAnnouncementContent(data: Api.Notification.ContentPreviewBody) {
  return request<Api.Notification.ContentPreview>({ url: "/admin/notifications/content-preview", method: "post", data })
}

/** Read authorized navigation targets without changing menus or notifications. */
export function fetchGetAnnouncementActionTargets() {
  return request<Api.Notification.ActionTargets>({ url: "/admin/notifications/action-targets", method: "get" })
}

/** Validate and resolve one unsaved action without opening or sending anything. */
export function fetchPreviewAnnouncementAction(data: Api.Notification.ActionInput) {
  return request<Api.Notification.ResolvedAction>({ url: "/admin/notifications/action-preview", method: "post", data })
}

export function fetchCancelAnnouncement(messageId: string) {
  return request<null>({ url: `/admin/notifications/${messageId}/cancel`, method: "post" })
}

export function fetchRecallAnnouncement(messageId: string) {
  return request<null>({ url: `/admin/notifications/${messageId}/recall`, method: "post" })
}

export function fetchGetNotificationDeliveries(params: Api.Notification.DeliveryQuery) {
  return request<Api.Notification.DeliveryPage>({ url: "/admin/notification-deliveries", method: "get", params })
}

export function fetchDeliverySummary(messageId: string) {
  return request<Api.Notification.DeliverySummary>({
    url: `/admin/notification-deliveries/${messageId}/summary`,
    method: "get",
  })
}

export function fetchRetryFailedDeliveries(messageId: string) {
  return request<Api.Notification.DeliveryRetry>({
    url: `/admin/notification-deliveries/${messageId}/retry-failed`,
    method: "post",
  })
}

/** Global banner has no inbox or unread side effects. */
export function fetchGetTopBanner() {
  return request<Api.Notification.TopBanner>({ url: "/notifications/top-banner", method: "get" })
}

export function fetchCheckBanner(data: Api.Notification.BannerCheckBody = {}) {
  return request<Api.Notification.BannerCheck>({ url: "/admin/notifications/banner-check", method: "post", data })
}
