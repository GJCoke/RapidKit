import { localStg } from "@/utils/storage"
import { io, Socket } from "socket.io-client"
import type { PermissionChangedPayload, PermissionSync } from "./permission-sync"

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

let permissionSignalHandler: Pick<PermissionSync, "signal" | "trigger"> | null = null

/** Register the handler that receives permission change signals from the global socket */
export function setPermissionSignalHandler(handler: Pick<PermissionSync, "signal" | "trigger"> | null) {
  permissionSignalHandler = handler
}

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

  globalSocket.on("permission:changed", (payload: PermissionChangedPayload) => permissionSignalHandler?.signal(payload))
  // Signals may be missed while disconnected; the first connect is not a reconnect.
  globalSocket.io.on("reconnect", () => permissionSignalHandler?.trigger())
}

/** Disconnect global socket */
export function disconnectGlobalSocket() {
  if (globalSocket) {
    globalSocket.disconnect()
    globalSocket = null
  }
}
