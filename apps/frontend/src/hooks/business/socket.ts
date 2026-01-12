import { ref, onUnmounted, Ref } from "vue"
import { io, type Socket, type ManagerOptions, type SocketOptions } from "socket.io-client"

export interface Options {
  url: string
  path?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  const connect = (options: Options): Socket | undefined => {
    if (socket.value?.connected) return

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
      transports: ["websocket", "polling"],
      ...ioOptions,
    })

    instance.on("connect", () => {
      isConnected.value = true
      isConnecting.value = false
      onConnect?.()
    })

    instance.on("disconnect", (reason) => {
      isConnected.value = false
      isConnecting.value = false
      onDisconnect?.(reason)
    })

    instance.on("connect_error", (err) => {
      isConnecting.value = false
      onError?.(err)
    })

    socket.value = instance
    return instance
  }

  const disconnect = () => {
    if (socket.value) {
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
