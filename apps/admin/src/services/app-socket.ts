import { Manager, type Socket } from "socket.io-client"
import { fetchUserInfo } from "@/services/api/auth"
import { getAuthSession } from "@/services/auth-session"
import { useAuthStore } from "@/stores/auth"

let manager: Manager | null = null
let generation = 0
let recovery: Promise<boolean> | null = null
const owners = new Map<Socket, number>()
const disposeRecovery = new Map<Socket, () => void>()

function bindRecovery(socket: Socket) {
  const opened = generation
  const session = getAuthSession()
  let attempts = 0
  let recovering = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let revoked: string | undefined
  const current = () => opened === generation && session === getAuthSession() && disposeRecovery.get(socket) === dispose
  const recover = async (code?: string) => {
    if (!current()) return
    if (code === "unauthorized") {
      useAuthStore.getState().clearAuth("forced")
      return
    }
    if (code !== "token_expired" || recovering) return
    recovering = true
    attempts = Math.min(attempts + 1, 10)
    // The HTTP client owns token rotation, including requests already recovering.
    if (!recovery) {
      const pending = fetchUserInfo()
        .then((result) => !result.error && Boolean(result.data))
        .catch(() => false)
        .finally(() => {
          if (recovery === pending) recovery = null
        })
      recovery = pending
    }
    const success = await recovery
    recovering = false
    if (!current()) return
    if (success) socket.connect()
    else
      timer = setTimeout(() => {
        void recover("token_expired")
      }, 1000 * attempts)
  }
  socket.on("connect", () => {
    attempts = 0
    clearTimeout(timer)
    revoked = undefined
  })
  socket.on("connect_error", (error: Error) => {
    void recover(error.message)
  })
  socket.on("auth:revoked", (payload: { code: string }) => {
    revoked = payload.code
  })
  socket.on("disconnect", (reason) => {
    const code = revoked
    revoked = undefined
    if (reason === "io server disconnect") void recover(code)
  })
  const online = () => {
    if (socket.connected) return
    attempts = 0
    void recover("token_expired")
  }
  window.addEventListener("online", online)
  const dispose = () => {
    clearTimeout(timer)
    window.removeEventListener("online", online)
  }
  disposeRecovery.set(socket, dispose)
}

export function openAppSocket(namespace: string): Socket {
  manager ??= new Manager(new URL(import.meta.env.VITE_SERVICE_BASE_URL || "/", window.location.origin).origin, {
    path: "/socket.io",
    transports: ["websocket"],
    autoConnect: false,
  })
  const socket = manager.socket(namespace, {
    auth: (callback) => callback({ access_token: localStorage.getItem("accessToken") || "" }),
  })
  if (!owners.has(socket)) {
    owners.set(socket, 0)
    bindRecovery(socket)
  }
  owners.set(socket, (owners.get(socket) ?? 0) + 1)
  if (!socket.active) socket.connect()
  return socket
}

/** A separate transport keeps each first-party chat identity independent while sharing auth recovery. */
export function openPrivateAppSocket(
  namespace: string,
  identity: Record<string, string>,
  query: Record<string, string>,
) {
  const metadata = { ...identity }
  const privateManager = new Manager(
    new URL(import.meta.env.VITE_SERVICE_BASE_URL || "/", window.location.origin).origin,
    {
      path: "/socket.io",
      transports: ["websocket"],
      autoConnect: false,
      query: { ...query },
    },
  )
  const socket = privateManager.socket(namespace, {
    auth: (callback) => callback({ ...metadata, access_token: localStorage.getItem("accessToken") || "" }),
  })
  owners.set(socket, 1)
  bindRecovery(socket)
  socket.connect()
  return socket
}

export function closeAppSocket(socket: Socket) {
  const count = owners.get(socket)
  if (count === undefined) return
  if (count > 1) {
    owners.set(socket, count - 1)
    return
  }
  owners.delete(socket)
  disposeRecovery.get(socket)?.()
  disposeRecovery.delete(socket)
  socket.removeAllListeners()
  socket.disconnect()
}

export function resetAppSockets() {
  generation++
  recovery = null
  for (const socket of owners.keys()) {
    owners.set(socket, 1)
    closeAppSocket(socket)
  }
  manager = null
}
