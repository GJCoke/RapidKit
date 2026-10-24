import { useEffect, useRef, useState } from "react"
import { io, type Socket } from "socket.io-client"
import { hasPermission, usePermission } from "@/features/auth"
import { getAuthSession } from "@/services/auth-session"
import { useAuthStore } from "@/stores/auth"
import { formatDebugData, type DebugConnection, type DebugLog } from "@/views/socketio/debug/modules/debug-model"
function canDebug(session: number) {
  const state = useAuthStore.getState()
  return session === getAuthSession() && Boolean(state.token) && hasPermission(state.userInfo, "socketio:read")
}
export function useSocketDebug() {
  useAuthStore((state) => state.token)
  const session = useRef(getAuthSession()).current
  const read = usePermission("socketio:read") && session === getAuthSession()
  const owned = useRef<{ socket: Socket; dispose: () => void } | null>(null)
  const connecting = useRef(false)
  const sequence = useRef(0)
  const [status, setStatus] = useState<"offline" | "connecting" | "online" | "error">("offline")
  const [logs, setLogs] = useState<DebugLog[]>([])
  function release() {
    const previous = owned.current
    owned.current = null
    connecting.current = false
    previous?.dispose()
  }
  useEffect(() => {
    if (!read) {
      release()
      setLogs([])
      setStatus("offline")
    }
    return release
  }, [read])
  function addLog(entry: Omit<DebugLog, "id" | "time">) {
    const log = { ...entry, id: ++sequence.current, time: Date.now() }
    setLogs((previous) => [log, ...previous])
  }
  return {
    hasConnection: read && Boolean(owned.current),
    status: read ? status : "offline",
    logs: read ? logs : [],
    clearLogs() {
      setLogs([])
    },
    connect(config: DebugConnection) {
      if (!canDebug(session) || connecting.current || owned.current?.socket.connected) return
      release()
      connecting.current = true
      setStatus("connecting")
      try {
        const socket = io(config.url, {
          path: config.path,
          auth: config.auth,
          transports: ["websocket"],
          forceNew: true,
          autoConnect: false,
        })
        const current = () => owned.current?.socket === socket && canDebug(session)
        const connected = () => {
          if (!current()) return
          connecting.current = false
          setStatus("online")
          addLog({ type: "info", message: { key: "connected", value: socket.id ?? "" } })
        }
        const disconnected = (reason: string) => {
          if (!current()) return
          connecting.current = false
          setStatus("offline")
          addLog({ type: "info", message: { key: "disconnected", value: reason } })
        }
        const failed = (error: Error) => {
          if (!current()) return
          connecting.current = false
          setStatus("error")
          addLog({ type: "error", message: { key: "connectionError", value: error.message } })
        }
        const received = (event: string, ...args: unknown[]) => {
          if (current()) addLog({ type: "receive", event, data: args.length === 1 ? args[0] : args })
        }
        owned.current = {
          socket,
          dispose() {
            socket.off("connect", connected)
            socket.off("disconnect", disconnected)
            socket.off("connect_error", failed)
            socket.offAny(received)
            socket.disconnect()
          },
        }
        socket.on("connect", connected)
        socket.on("disconnect", disconnected)
        socket.on("connect_error", failed)
        socket.onAny(received)
        socket.connect()
      } catch (error) {
        release()
        setStatus("error")
        addLog({
          type: "error",
          message: { key: "connectionError", value: error instanceof Error ? error.message : formatDebugData(error) },
        })
      }
    },
    disconnect() {
      if (!canDebug(session) || !owned.current) return
      release()
      setStatus("offline")
      addLog({ type: "info", message: { key: "disconnected", value: "io client disconnect" } })
    },
    send(event: string, data: unknown) {
      if (!canDebug(session) || !owned.current?.socket.connected || !event.trim()) return false
      try {
        owned.current.socket.emit(event, data)
        addLog({ type: "send", event, data })
        return true
      } catch (error) {
        addLog({
          type: "error",
          event,
          message: { key: "emitError", value: error instanceof Error ? error.message : formatDebugData(error) },
        })
        return false
      }
    },
  }
}
