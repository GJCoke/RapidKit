import { ref, onUnmounted, Ref } from "vue"
import { io, type Socket, type ManagerOptions, type SocketOptions } from "socket.io-client"
import { createLogger } from "@/utils/logger"
import { diagnosticGeneration, recordDiagnosticEvent } from "@/utils/diagnostics"
import { reportSocketDiagnostic } from "@/utils/socket-diagnostics"
import { getAuthSession } from "@/service/request/auth-session"

const logger = createLogger("socket")

export interface Options {
  url: string
  path?: string
  // oxlint-disable-next-line @typescript-eslint/no-explicit-any
  auth?: any
  namespace?: string
  ioOptions?: Partial<ManagerOptions & SocketOptions>
  onConnect?: () => void
  onDisconnect?: (reason: Socket.DisconnectReason) => void
  onError?: (err: Error) => void
}

export interface Result {
  /** Socket 实例 */
  socket: Ref<Socket | null>
  /** 是否已连接 */
  isConnected: Ref<boolean>
  /** 是否正在连接中 */
  isConnecting: Ref<boolean>
  /** 连接方法 */
  connect: (options: Options) => Socket | undefined
  /** 断开方法 */
  disconnect: () => void
}

export function useSocket(): Result {
  const socket = ref<Socket | null>(null)
  const isConnected = ref(false)
  const isConnecting = ref(false)
  let removeReconnect: (() => void) | undefined

  const connect = (options: Options): Socket | undefined => {
    if (socket.value?.connected) return
    getAuthSession()
    const owner = diagnosticGeneration()

    isConnecting.value = true
    const {
      url,
      path = "/socket.io",
      namespace = "/",
      ioOptions = {},
      auth,
      onConnect,
      onDisconnect,
      onError,
    } = options
    const socketUrl = namespace === "/" ? url : `${url}${namespace.startsWith("/") ? "" : "/"}${namespace}`

    const instance = io(socketUrl, {
      path,
      auth,
      ...ioOptions,
      transports: ["websocket"],
    })

    instance.on("connect", () => {
      recordDiagnosticEvent({ category: "socket", phase: "connected" }, owner)
      logger.debug("Socket connected")
      isConnected.value = true
      isConnecting.value = false
      onConnect?.()
    })

    instance.on("disconnect", (reason) => {
      recordDiagnosticEvent(
        { category: "socket", phase: "disconnected", reason_code: reason.replaceAll(" ", "_") },
        owner,
      )
      logger.debug("Socket disconnected", { reason })
      isConnected.value = false
      isConnecting.value = false
      onDisconnect?.(reason)
    })

    instance.on("connect_error", (err) => {
      recordDiagnosticEvent({ category: "socket", phase: "failure", reason_code: "connect_error" }, owner)
      logger.error("Socket connection failed", { reason: "connect_error" })
      isConnecting.value = false
      onError?.(err)
    })
    removeReconnect?.()
    const logReconnect = (attempt: number) => {
      recordDiagnosticEvent({ category: "socket", phase: "reconnecting", attempt }, owner)
      logger.debug("Socket reconnecting", { attempt })
    }
    instance.io.on("reconnect_attempt", logReconnect)
    removeReconnect = () => instance.io.off("reconnect_attempt", logReconnect)

    instance.on("diagnostic:error", (payload: unknown) => {
      reportSocketDiagnostic(payload, owner)
    })

    socket.value = instance
    return instance
  }

  const disconnect = () => {
    if (socket.value) {
      removeReconnect?.()
      removeReconnect = undefined
      socket.value.disconnect()
      socket.value = null
    }
    isConnected.value = false
    isConnecting.value = false
  }

  onUnmounted(() => {
    disconnect()
  })

  return {
    // @ts-expect-error TS 推导错误
    socket,
    isConnected,
    isConnecting,
    connect,
    disconnect,
  }
}
