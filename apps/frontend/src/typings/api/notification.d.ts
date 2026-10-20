/**
 * Notification API types.
 *
 * The inbox endpoints are generated from the current OpenAPI schema. The
 * template, announcement and preference endpoints are deliberately defined
 * from their backend response schemas until OpenAPI types are regenerated.
 */

import type { Service } from "@/typings/service"

declare global {
  namespace Api {
    namespace Notification {
      type ContentMode = "i18n" | "raw" | "local"
      type TemplateContentMode = Exclude<ContentMode, "local">
      type LocalizedContent = NonNullable<AnnouncementCreate["localizedContent"]>

      type ContentFormat = "plain_text" | "markdown"

      type Level = "info" | "success" | "warning" | "error"

      type Channel = "in_app"

      type ActionInput = Service.ApiRequest<"/api/v1/admin/notifications/action-preview", "post", "body">
      type ActionTargets = Service.ApiResponse<"/api/v1/admin/notifications/action-targets", "get">
      type ActionTarget = ActionTargets[number]
      type ResolvedAction = Service.ApiResponse<"/api/v1/admin/notifications/action-preview", "post">
      type ActionRef = ActionInput

      type InboxQuery = Service.ApiRequest<"/api/v1/notifications", "get", "query">

      type InboxMessage = Service.ApiResponse<"/api/v1/notifications">["items"][number]

      /** UI-normalized version of the OpenAPI inbox message response. */
      type Message = Omit<InboxMessage, "action" | "contentMode" | "level"> & {
        action?: ActionRef | null
        contentMode: ContentMode
        level: Level
      }

      type InboxPage = Omit<Service.ApiResponse<"/api/v1/notifications">, "items"> & {
        items: Message[]
      }

      type UnreadCount = Service.ApiResponse<"/api/v1/notifications/unread-count">

      type MarkAllReadResponse = Service.ApiResponse<"/api/v1/notifications/read-all", "post">

      type MarkReadResponse = Service.ApiResponse<"/api/v1/notifications/{notification_id}/read", "patch">

      type ArchiveResponse = Service.ApiResponse<"/api/v1/notifications/{notification_id}/archive", "patch">

      type DeleteResponse = Service.ApiResponse<"/api/v1/notifications/{notification_id}", "delete">

      /** P3 preference endpoints are not yet included in the generated schema. */
      interface PreferenceItem {
        category: string
        nameKey: string
        enabled: boolean
        closable: boolean
        reserved: boolean
      }

      interface PreferenceUpdate {
        enabled: boolean
      }

      /** P2 template endpoints are not yet included in the generated schema. */
      interface Template {
        id: string
        code: string
        name: string
        category: string
        level: Level
        contentMode: TemplateContentMode
        titleTemplate: string
        contentTemplate: string
        contentFormat?: ContentFormat | null
        variableSchema: Record<string, Record<string, unknown>>
        defaultChannels: Channel[]
        defaultAction?: Record<string, unknown> | null
        mandatory: boolean
        enabled: boolean
        version: number
        createTime: string
        updateTime: string
      }

      interface TemplateListQuery {
        page: number
        pageSize: number
        keyword?: string
        enabled?: boolean
      }

      type TemplateList = Api.Common.PaginatingQueryRecord<Template>

      interface TemplateCreate {
        code: string
        name: string
        category: string
        level: Level
        contentMode: TemplateContentMode
        titleTemplate: string
        contentTemplate: string
        contentFormat?: ContentFormat | null
        variableSchema?: Record<string, Record<string, unknown>>
        defaultChannels?: Channel[]
        defaultAction?: Record<string, unknown> | null
        mandatory?: boolean
        enabled?: boolean
      }

      interface TemplateUpdate {
        name?: string
        category?: string
        level?: Level
        titleTemplate?: string
        contentTemplate?: string
        contentFormat?: ContentFormat | null
        variableSchema?: Record<string, Record<string, unknown>>
        defaultChannels?: Channel[]
        defaultAction?: Record<string, unknown> | null
        mandatory?: boolean
        enabled?: boolean
      }

      interface AudienceRule {
        type: "user" | "role" | "department" | "all"
        value?: string | null
        includeDescendants?: boolean
      }

      type AnnouncementCreate = Service.ApiRequest<"/api/v1/admin/notifications", "post", "body">

      type AnnouncementUpdate = Service.ApiRequest<"/api/v1/admin/notifications/{message_id}", "put", "body">

      type AnnouncementDetail = Service.ApiResponse<"/api/v1/admin/notifications/{message_id}", "get">

      type AnnouncementList = Service.ApiResponse<"/api/v1/admin/notifications", "get">
      type AnnouncementItem = AnnouncementList["records"][number]
      type AnnouncementListQuery = NonNullable<Service.ApiRequest<"/api/v1/admin/notifications", "get", "query">>
      type BannerCheckBody = Service.ApiRequest<"/api/v1/admin/notifications/banner-check", "post", "body">
      type RawTopBanner = Service.ApiResponse<"/api/v1/notifications/top-banner", "get">
      type BannerSummary = Omit<NonNullable<RawTopBanner["current"]>, "contentMode" | "action"> & {
        contentMode: ContentMode
        action?: ActionRef | null
      }
      type TopBanner = Omit<RawTopBanner, "current"> & { current?: BannerSummary | null }
      type BannerCheck = Omit<
        Service.ApiResponse<"/api/v1/admin/notifications/banner-check", "post">,
        "current" | "scheduled"
      > & {
        current?: BannerSummary | null
        scheduled?: BannerSummary | null
      }
      type BannerConfirmation = Pick<AnnouncementCreate, "bannerRevision" | "replaceCurrent" | "replaceScheduled">

      type AudiencePreviewBody = Service.ApiRequest<"/api/v1/admin/notifications/audience-preview", "post", "body">
      type UnsavedAudiencePreview = Service.ApiResponse<"/api/v1/admin/notifications/audience-preview", "post">
      type ContentPreviewBody = Service.ApiRequest<"/api/v1/admin/notifications/content-preview", "post", "body">
      type ContentPreview = Service.ApiResponse<"/api/v1/admin/notifications/content-preview", "post">

      type DeliveryQuery = NonNullable<Service.ApiRequest<"/api/v1/admin/notification-deliveries", "get", "query">>
      type DeliveryPage = Service.ApiResponse<"/api/v1/admin/notification-deliveries">
      type Delivery = DeliveryPage["records"][number]
      type DeliveryRecipient = NonNullable<Delivery["recipient"]>
      type DeliveryMessage = NonNullable<Delivery["message"]>
      type DeliveryStatus = Delivery["status"]
      type DeliverySummary = Service.ApiResponse<"/api/v1/admin/notification-deliveries/{message_id}/summary">
      type DeliveryRetry = Service.ApiResponse<
        "/api/v1/admin/notification-deliveries/{message_id}/retry-failed",
        "post"
      >
    }
  }
}
