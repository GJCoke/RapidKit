import { closeAppSocket, openAppSocket } from "@/hooks/common/app-socket"
import { getToken } from "@/store/modules/auth/shared"
import type { Socket } from "socket.io-client"
import { useNotificationStore } from "./index"
import { useBannerStore } from "../banner"

let socket: Socket | null = null
let removeVisibilityListener: (() => void) | undefined

function destroySocket() {
  removeVisibilityListener?.()
  removeVisibilityListener = undefined
  if (!socket) return

  closeAppSocket(socket)
  socket = null
}

export function connectNotificationSocket(): Socket | undefined {
  if (!getToken()) return
  if (socket) return socket

  destroySocket()

  const store = useNotificationStore()
  const banner = useBannerStore()
  banner.start(getToken())
  socket = openAppSocket("/notifications")

  let connectedOnce = false
  let latestNeeded = false
  let freshInboxNeeded = false
  let unreadFallbackNeeded = false
  let fallbackAttempted = false
  function refreshLatestWhenVisible() {
    if (!latestNeeded || (typeof document !== "undefined" && document.visibilityState === "hidden")) return
    latestNeeded = false
    if (unreadFallbackNeeded) {
      unreadFallbackNeeded = false
      void store.calibrate()
    } else void store.refreshLatest(freshInboxNeeded)
    freshInboxNeeded = false
  }
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", refreshLatestWhenVisible)
    removeVisibilityListener = () => document.removeEventListener("visibilitychange", refreshLatestWhenVisible)
  }
  socket.on("connect", () => {
    // The server pushes the authoritative unread count on every connection.
    latestNeeded = true
    freshInboxNeeded = connectedOnce || fallbackAttempted
    unreadFallbackNeeded = false
    refreshLatestWhenVisible()
    if (connectedOnce) void banner.refresh()
    connectedOnce = true
  })
  socket.on("connect_error", () => {
    if (connectedOnce || fallbackAttempted) return
    fallbackAttempted = true
    unreadFallbackNeeded = true
    latestNeeded = true
    refreshLatestWhenVisible()
  })
  socket.on("announcement:banner_changed", (payload: { revision: number }) => {
    banner.invalidate(payload.revision)
  })
  socket.on("notification:new", (message: Api.Notification.Message) => {
    store.onRealtimeNew(message)
  })
  socket.on("notification:recalled", (payload: { messageId: string }) => {
    void store.onRealtimeRecalled(payload.messageId)
  })
  socket.on("notification:unread-count", (payload: { count: number }) => {
    store.onRealtimeUnreadCount(payload.count)
  })

  return socket
}

export function disconnectNotificationSocket() {
  destroySocket()
  useNotificationStore().reset()
  useBannerStore().reset()
}
