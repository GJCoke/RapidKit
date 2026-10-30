import { parseApiTime } from "@/utils/datetime"

export function isNotificationActionable(message: Api.Notification.Message, now = Date.now()): boolean {
  if (message.status === "recalled" || message.status === "expired") return false
  if (message.expireAt) {
    const expiry = parseApiTime(message.expireAt)
    if (!expiry.isValid() || expiry.valueOf() <= now) return false
  }
  return Boolean(message.action)
}
