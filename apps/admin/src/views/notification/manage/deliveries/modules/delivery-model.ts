import dayjs from "dayjs"
import type { Delivery, DeliveryMessage, DeliveryRecipient } from "@/services/api/notification-delivery"
import { parseApiDate } from "@/shared/date-time"
export const deliveryStates = ["sent", "pending", "processing", "retrying", "dead", "cancelled"] as const
export function normalizeDeliveryMessageId(value: string): string | null {
  const id = value.trim().toLowerCase()
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id) ? id : null
}
export function deliveryTime(value?: string | Date | null): string {
  if (!value) return "—"
  const date = value instanceof Date ? value : parseApiDate(value)
  return Number.isNaN(date.getTime()) ? "—" : dayjs(date).format("YYYY-MM-DD HH:mm:ss")
}
export function deliveryOutcomeTime(row: Delivery) {
  if (row.status === "sent" && row.sentAt) return { label: "sentAt", value: row.sentAt, isUpdated: false }
  if (row.status === "pending" && row.nextAttemptAt)
    return { label: "outcome.plannedAt", value: row.nextAttemptAt, isUpdated: false }
  if (row.status === "retrying" && row.nextAttemptAt)
    return { label: "nextAttemptAt", value: row.nextAttemptAt, isUpdated: false }
  return { label: "outcome.lastUpdated", value: row.updateTime, isUpdated: true }
}
export function deliveryErrorKey(code?: string | null) {
  return !code
    ? undefined
    : code === "inapp_emit_failed"
      ? "emitFailed"
      : code === "unknown_channel"
        ? "unknownChannel"
        : "deliveryFailed"
}
export function deliveryRecipientName(recipient: DeliveryRecipient | null | undefined, t: (key: string) => string) {
  if (!recipient) return t("recipientUnavailable")
  if (recipient.state === "deleted") return t("userDeleted")
  return recipient.name?.trim() || recipient.username?.trim() || t("unnamedUser")
}
export function deliveryRecipientSubtitle(recipient?: DeliveryRecipient | null) {
  if (!recipient || recipient.state === "deleted") return ""
  return [recipient.name?.trim() && recipient.username ? `@${recipient.username}` : "", recipient.department]
    .filter(Boolean)
    .join(" · ")
}
export function deliveryMessageTitle(
  message: Pick<DeliveryMessage, "title" | "contentMode" | "titleParams" | "titles" | "defaultLocale">,
  locale: string,
  translate: (key: string, params?: Record<string, unknown> | null) => string,
) {
  if (message.contentMode === "local")
    return message.titles?.[locale] || message.titles?.[message.defaultLocale ?? ""] || message.title
  return message.contentMode === "i18n" ? translate(message.title, message.titleParams) : message.title
}
export function retryMessageAllowed(
  message: Pick<DeliveryMessage, "status" | "expireAt"> | null | undefined,
  now = Date.now(),
) {
  return (
    !message ||
    (message.status === "published" && (!message.expireAt || parseApiDate(message.expireAt).getTime() > now))
  )
}
