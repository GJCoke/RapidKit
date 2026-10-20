import { closeAppSocket, openAppSocket } from "@/hooks/common/app-socket"
import { getToken } from "@/store/modules/auth/shared"
import type { Socket } from "socket.io-client"
import { useNotificationStore } from "./index"
import { useBannerStore } from "../banner"

let socket: Socket | null = null

function destroySocket() {
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

  socket.on("connect", () => {
    void store.calibrate()
    void banner.refresh()
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
