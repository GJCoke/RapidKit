import { onUnmounted, ref, shallowRef, type Ref, type ShallowRef } from "vue"
import { Manager, type Socket } from "socket.io-client"
import { refreshAccessToken } from "@/service/request"
import { useAuthStore } from "@/store/modules/auth"
import { getToken } from "@/store/modules/auth/shared"

let manager: Manager | null = null
let generation = 0
let refreshPromise: Promise<boolean> | null = null
const sockets = new Map<Socket, number>()
const recoveryBindings = new WeakMap<Socket, object>()

function hasFreshToken() {
  try {
    const payload = getToken().split(".")[1].replace(/-/g, "+").replace(/_/g, "/")
    const { exp } = JSON.parse(atob(payload))
    return typeof exp === "number" && exp * 1000 > Date.now()
  } catch {
    return false
  }
}

export function bindAuthRecovery(socket: Socket): void {
  if (recoveryBindings.has(socket)) return
  const binding = {}
  recoveryBindings.set(socket, binding)
  const openedGeneration = generation
  let attempted = false
  let revoked: string | undefined

  async function recover(code: string | undefined) {
    if (openedGeneration !== generation || recoveryBindings.get(socket) !== binding) return
    if (code === "unauthorized") {
      await useAuthStore().resetStore()
      return
    }
    if (code !== "token_expired" || attempted) return
    attempted = true
    try {
      let success = hasFreshToken()
      if (!success) {
        if (!refreshPromise) {
          const pending = refreshAccessToken().finally(() => {
            if (refreshPromise === pending) refreshPromise = null
          })
          refreshPromise = pending
        }
        success = await refreshPromise
      }
      if (success && openedGeneration === generation && recoveryBindings.get(socket) === binding) socket.connect()
    } catch {
      // Failed refresh leaves the refused socket disconnected.
    }
  }

  socket.on("connect", () => {
    attempted = false
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
}

export function openAppSocket(namespace: string): Socket {
  manager ??= new Manager(new URL(import.meta.env.VITE_SERVICE_BASE_URL || "", window.location.origin).origin, {
    path: "/socket.io",
    transports: ["websocket", "polling"],
    autoConnect: false,
  })
  const socket = manager.socket(namespace, { auth: (callback) => callback({ access_token: getToken() }) })
  bindAuthRecovery(socket)
  sockets.set(socket, (sockets.get(socket) || 0) + 1)
  if (!socket.active) socket.connect()
  return socket
}

export function closeAppSocket(socket: Socket): void {
  const owners = sockets.get(socket) || 0
  if (owners > 1) {
    sockets.set(socket, owners - 1)
    return
  }
  recoveryBindings.delete(socket)
  socket.disconnect()
  socket.removeAllListeners()
  sockets.delete(socket)
}

export function resetAppSockets(): void {
  generation++
  refreshPromise = null
  for (const socket of sockets.keys()) {
    sockets.set(socket, 1)
    closeAppSocket(socket)
  }
  sockets.clear()
  manager = null
}

export function useAppSocket(): {
  socket: ShallowRef<Socket | null>
  isConnected: Ref<boolean>
  connect(namespace: string): Socket
  disconnect(): void
  on(event: string, listener: Parameters<Socket["on"]>[1]): void
} {
  const socket = shallowRef<Socket | null>(null)
  const isConnected = ref(false)
  const subscriptions: (() => void)[] = []
  const markConnected = () => {
    isConnected.value = true
  }
  const markDisconnected = () => {
    isConnected.value = false
  }

  function disconnect() {
    for (const remove of subscriptions.splice(0)) remove()
    if (socket.value) {
      socket.value.off("connect", markConnected)
      socket.value.off("disconnect", markDisconnected)
      closeAppSocket(socket.value)
      socket.value = null
    }
    isConnected.value = false
  }

  function connect(namespace: string): Socket {
    if (socket.value) disconnect()
    const instance = openAppSocket(namespace)
    socket.value = instance
    isConnected.value = instance.connected
    instance.on("connect", markConnected)
    instance.on("disconnect", markDisconnected)
    return instance
  }

  function on(event: string, listener: Parameters<Socket["on"]>[1]) {
    const instance = socket.value
    if (!instance) return
    instance.on(event, listener)
    subscriptions.push(() => {
      instance.off(event, listener)
    })
  }

  onUnmounted(disconnect)
  return { socket, isConnected, connect, disconnect, on }
}
