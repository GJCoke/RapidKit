export function isNotificationActionable(message: Api.Notification.Message): boolean {
  if (message.status === "recalled" || message.status === "expired") return false
  if (message.expireAt && Date.parse(message.expireAt) <= Date.now()) return false
  return Boolean(message.action)
}
