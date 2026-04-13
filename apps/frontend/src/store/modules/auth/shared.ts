import { localStg } from "@/utils/storage"
import { io, Socket } from "socket.io-client"

/** Get token */
export function getToken() {
  return localStg.get("token") || ""
}

/** Clear auth storage */
export function clearAuthStorage() {
  localStg.remove("token")
  localStg.remove("refreshToken")
}

// ==================== Global Socket Connection ====================

let globalSocket: Socket | null = null

/** Get global socket base URL */
function getSocketBaseUrl() {
  return new URL(import.meta.env.VITE_SERVICE_BASE_URL || "", window.location.origin).origin
}

/** Connect global socket with current token (default namespace, for online user tracking) */
export function connectGlobalSocket() {
  const token = getToken()
  if (!token) return

  // Disconnect existing connection if any
  disconnectGlobalSocket()

  globalSocket = io(getSocketBaseUrl(), {
    path: "/socket.io",
    auth: { access_token: token },
    transports: ["websocket", "polling"],
  })
}

/** Disconnect global socket */
export function disconnectGlobalSocket() {
  if (globalSocket) {
    globalSocket.disconnect()
    globalSocket = null
  }
}
