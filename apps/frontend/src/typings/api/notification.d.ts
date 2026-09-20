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
      type ContentMode = "i18n" | "raw"

      type ContentFormat = "plain_text" | "markdown"

      type Level = "info" | "success" | "warning" | "error"

      type Channel = "in_app"

      interface ActionRef {
        route: string
        params?: Record<string, unknown>
        label?: string | null
      }

      type InboxQuery = Service.ApiRequest<"/api/v1/notifications", "get", "query">

      type InboxMessage = Service.ApiResponse<"/api/v1/notifications/{notification_id}">

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
        contentMode: ContentMode
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
        contentMode: ContentMode
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

      interface AnnouncementCreate {
        category?: string
        level?: Level
        templateCode?: string | null
        templateVariables?: Record<string, unknown>
        i18NKey?: string | null
        i18NParams?: Record<string, unknown>
        rawTitle?: string | null
        rawContent?: string | null
        rawFormat?: ContentFormat
        audience: AudienceRule[]
        mandatory?: boolean
        channels?: Channel[]
        action?: ActionRef | null
        publishAt?: string | null
        expireAt?: string | null
      }

      type AnnouncementUpdate = Service.ApiRequest<"/api/v1/admin/notifications/{message_id}", "put", "body">

      type AnnouncementDetail = Service.ApiResponse<"/api/v1/admin/notifications/{message_id}", "get">

      interface AnnouncementItem {
        id: string
        source: string
        category: string
        level: Level
        contentMode: string
        title: string
        content: string
        status: "draft" | "scheduled" | "publishing" | "published" | "expired" | "cancelled" | "recalled"
        mandatory: boolean
        publishAt?: string | null
        publishedAt?: string | null
        expireAt?: string | null
        recalledAt?: string | null
        cancelledAt?: string | null
        createTime: string
        updateTime: string
      }

      interface AnnouncementListQuery {
        page: number
        pageSize: number
        status?: AnnouncementItem["status"]
        category?: string
      }

      type AnnouncementList = Api.Common.PaginatingQueryRecord<AnnouncementItem>

      interface AudiencePreview {
        total: number
        byType: Record<string, number>
      }

      interface DeliverySummary {
        messageId: string
        byStatus: Record<string, number>
      }
    }
  }
}
