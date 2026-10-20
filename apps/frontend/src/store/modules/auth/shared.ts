import { localStg } from "@/utils/storage"
import type { Socket } from "socket.io-client"
import { closeAppSocket, openAppSocket } from "@/hooks/common/app-socket"
import type { PermissionChangedPayload, PermissionSync } from "./permission-sync"

/** Get token */
export function getToken() {
  return localStg.get("token") || ""
}

/** Clear auth storage */
export function clearAuthStorage() {
  localStg.remove("token")
  localStg.remove("refreshToken")
  localStg.remove("impersonation")
  localStg.remove("impersonatorToken")
  localStg.remove("impersonatorRefreshToken")
  localStg.remove("impersonatorReturnPath")
}

// ==================== Global Socket Connection ====================

let globalSocket: Socket | null = null

let permissionSignalHandler: Pick<PermissionSync, "signal" | "trigger"> | null = null

/** Register the handler that receives permission change signals from the global socket */
export function setPermissionSignalHandler(handler: Pick<PermissionSync, "signal" | "trigger"> | null) {
  permissionSignalHandler = handler
}

/** Connect global socket with current token (default namespace, for online user tracking) */
export function connectGlobalSocket() {
  const token = getToken()
  if (!token) return

  // Disconnect existing connection if any
  disconnectGlobalSocket()

  globalSocket = openAppSocket("/")

  globalSocket.on("permission:changed", (payload: PermissionChangedPayload) => permissionSignalHandler?.signal(payload))
  // Signals may be missed while disconnected; the first connect is not a reconnect.
  globalSocket.io.on("reconnect", onPermissionReconnect)
}

/** Disconnect global socket */
export function disconnectGlobalSocket() {
  if (globalSocket) {
    globalSocket.io.off("reconnect", onPermissionReconnect)
    closeAppSocket(globalSocket)
    globalSocket = null
  }
}

function onPermissionReconnect() {
  permissionSignalHandler?.trigger()
}
