import dayjs from "dayjs"
import { $t, getLocale } from "@/locales"

export const deliveryText = (key: string) => $t(`page.notification.manage.deliveries.${key}` as I18nFullKey)
export const deliveryStates = ["sent", "pending", "processing", "retrying", "dead", "cancelled"] as const
export const deliveryStateStyle = {
  sent: { type: "success", icon: "carbon:checkmark-outline", color: "text-success" },
  pending: { type: "default", icon: "carbon:time", color: "text-base-text-2" },
  processing: { type: "info", icon: "carbon:in-progress", color: "text-info" },
  retrying: { type: "warning", icon: "carbon:renew", color: "text-warning" },
  dead: { type: "error", icon: "carbon:close-outline", color: "text-error" },
  cancelled: { type: "default", icon: "carbon:subtract-alt", color: "text-base-text-3" },
} as const

export function deliveryTime(value?: string | Date | null) {
  return value ? dayjs(value).format("YYYY-MM-DD HH:mm:ss") : "—"
}

export function deliveryOutcomeTime(row: Api.Notification.Delivery) {
  if (row.status === "sent" && row.sentAt) return { label: "sentAt", value: row.sentAt, isUpdated: false }
  if (row.status === "pending" && row.nextAttemptAt) {
    return { label: "outcome.plannedAt", value: row.nextAttemptAt, isUpdated: false }
  }
  if (row.status === "retrying" && row.nextAttemptAt) {
    return { label: "nextAttemptAt", value: row.nextAttemptAt, isUpdated: false }
  }
  return { label: "outcome.lastUpdated", value: row.updateTime, isUpdated: true }
}

export function deliveryError(code?: string | null) {
  if (!code) return "—"
  if (code === "inapp_emit_failed") return deliveryText("emitFailed")
  if (code === "unknown_channel") return deliveryText("unknownChannel")
  return deliveryText("deliveryFailed")
}

export function deliveryRecipientName(recipient?: Api.Notification.DeliveryRecipient | null) {
  if (!recipient) return deliveryText("recipientUnavailable")
  if (recipient.state === "deleted") return deliveryText("userDeleted")
  return recipient.name.trim() || recipient.username.trim() || deliveryText("unnamedUser")
}

export function deliveryMessageTitle(message?: Api.Notification.DeliveryMessage | null) {
  if (!message) return deliveryText("messageUnavailable")
  if (message.contentMode === "local") {
    return message.titles?.[getLocale()] || message.titles?.[message.defaultLocale || ""] || message.title
  }
  if (message.contentMode === "i18n") return $t(message.title as I18nFullKey, message.titleParams ?? {})
  return message.title
}
