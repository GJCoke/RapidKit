import { parseApiTime } from "@/utils/datetime"

export function isNotificationActionable(message: Api.Notification.Message): boolean {
  if (message.status === "recalled" || message.status === "expired") return false
  if (message.expireAt) {
    const expiry = parseApiTime(message.expireAt)
    if (!expiry.isValid() || expiry.valueOf() <= Date.now()) return false
  }
  return Boolean(message.action)
}
