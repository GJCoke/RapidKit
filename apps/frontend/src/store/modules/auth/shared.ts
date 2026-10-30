import { localStg } from "@/utils/storage"
import type { Socket } from "socket.io-client"
import { closeAppSocket, openAppSocket, wasSocketAuthRenewal } from "@/hooks/common/app-socket"
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
let disposeGlobalListeners: (() => void) | null = null

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

  const socket = openAppSocket("/")
  globalSocket = socket
  let connectedBefore = socket.connected
  // Namespace connect covers transport reconnects, after authentication succeeds.
  const onConnect = () => {
    if (connectedBefore && !wasSocketAuthRenewal(socket)) permissionSignalHandler?.trigger()
    connectedBefore = true
  }
  const onPermissionChanged = (payload: PermissionChangedPayload) => permissionSignalHandler?.signal(payload)
  socket.on("connect", onConnect)
  socket.on("permission:changed", onPermissionChanged)
  disposeGlobalListeners = () => {
    socket.off("connect", onConnect)
    socket.off("permission:changed", onPermissionChanged)
  }
}

/** Disconnect global socket */
export function disconnectGlobalSocket() {
  disposeGlobalListeners?.()
  disposeGlobalListeners = null
  if (globalSocket) {
    closeAppSocket(globalSocket)
    globalSocket = null
  }
}
