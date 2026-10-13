import { io } from "socket.io-client"
import type { Socket } from "socket.io-client"
import { useNotificationStore } from "./index"
import { useBannerStore } from "../banner"

let socket: Socket | null = null
let socketToken: string | null = null

function getSocketBaseUrl(): string {
  return new URL(import.meta.env.VITE_SERVICE_BASE_URL || "", window.location.origin).origin
}

function destroySocket() {
  if (!socket) return

  socket.removeAllListeners()
  socket.disconnect()
  socket = null
  socketToken = null
}

export function connectNotificationSocket(token: string): Socket | undefined {
  if (!token) return
  if (socket && socketToken === token) return socket

  destroySocket()

  const store = useNotificationStore()
  const banner = useBannerStore()
  banner.start(token)
  socketToken = token
  socket = io(`${getSocketBaseUrl()}/notifications`, {
    path: "/socket.io",
    auth: { access_token: token },
    transports: ["websocket", "polling"],
  })

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
