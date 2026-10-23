import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useAuthStore } from "@/stores/auth"
import { getAuthSession } from "@/services/auth-session"
import { openAppSocket, closeAppSocket } from "@/services/app-socket"
import type { NotificationMessage } from "@/services/api/notification"
import {
  notificationKeys,
  receiveNotification,
  receiveUnreadCount,
  recallNotification,
} from "@/services/hooks/use-notifications"
import { invalidateNotificationBanner } from "@/services/hooks/use-notification-banner"

export function NotificationRuntime() {
  const authenticated = Boolean(useAuthStore((state) => state.token))
  const session = getAuthSession(),
    client = useQueryClient()
  useEffect(() => {
    if (!authenticated) return
    let active = true
    const current = () => active && session === getAuthSession()
    const socket = openAppSocket("/notifications")
    const connected = () => {
      if (current()) void client.invalidateQueries({ queryKey: notificationKeys.root(session) })
    }
    const received = (message: NotificationMessage) => {
      if (current()) receiveNotification(client, session, message)
    }
    const recalled = (payload: { messageId: string }) => {
      if (current() && typeof payload?.messageId === "string") recallNotification(client, session, payload.messageId)
    }
    const count = (payload: { count: number }) => {
      if (current() && Number.isFinite(payload?.count)) receiveUnreadCount(client, session, payload.count)
    }
    const banner = (payload: { revision: number }) => {
      if (current() && Number.isFinite(payload?.revision))
        invalidateNotificationBanner(client, session, payload.revision)
    }
    socket.on("connect", connected)
    socket.on("notification:new", received)
    socket.on("notification:recalled", recalled)
    socket.on("notification:unread-count", count)
    socket.on("announcement:banner_changed", banner)
    if (socket.connected) connected()
    return () => {
      active = false
      socket.off("connect", connected)
      socket.off("notification:new", received)
      socket.off("notification:recalled", recalled)
      socket.off("notification:unread-count", count)
      socket.off("announcement:banner_changed", banner)
      closeAppSocket(socket)
    }
  }, [authenticated, session, client])
  return null
}
