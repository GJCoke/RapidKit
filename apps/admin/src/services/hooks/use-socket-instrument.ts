import { useEffect, useRef, useState } from "react"
import { io, type Socket } from "socket.io-client"
import { hasPermission, usePermission } from "@/features/auth"
import { useAuthStore } from "@/stores/auth"
import { getAuthSession } from "@/services/auth-session"
import {
  emptyInstrumentState,
  applyInstrumentEvent,
  parseInstrumentEvent,
  instrumentClientKey,
  type InstrumentClient,
  type InstrumentSocketConfig,
  type InstrumentState,
} from "@/views/socketio/instrument/modules/instrument-model"
function canInstrument(session: number) {
  const state = useAuthStore.getState()
  return session === getAuthSession() && Boolean(state.token) && hasPermission(state.userInfo, "socketio:read")
}
type InstrumentNotice =
  | { key: "adminSessionStarted" }
  | { key: "serverRemoved" | "disconnectCommandSent"; value: string }
export function useSocketInstrument() {
  useAuthStore((state) => state.token)
  const session = useRef(getAuthSession()).current,
    read = usePermission("socketio:read") && session === getAuthSession()
  const owned = useRef<{ socket: Socket; dispose: () => void } | null>(null),
    connecting = useRef(false),
    latest = useRef(emptyInstrumentState())
  const [data, setData] = useState(latest.current),
    [status, setStatus] = useState<"offline" | "connecting" | "online" | "error">("offline"),
    [error, setError] = useState<string | null>(null),
    [notice, setNotice] = useState<InstrumentNotice | null>(null),
    [now, setNow] = useState(Date.now)
  function update(next: InstrumentState) {
    latest.current = next
    setData(next)
  }
  function reset() {
    update(emptyInstrumentState())
  }
  function release() {
    const previous = owned.current
    owned.current = null
    connecting.current = false
    previous?.dispose()
  }
  useEffect(() => {
    if (!read) {
      release()
      reset()
      setStatus("offline")
      setError(null)
      setNotice(null)
      return
    }
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => {
      clearInterval(timer)
      release()
    }
  }, [read])
  function failure(value: unknown) {
    release()
    reset()
    setStatus("error")
    setError(value instanceof Error ? value.message : String(value))
    setNotice(null)
  }
  return {
    data: read ? data : emptyInstrumentState(),
    hasConnection: read && Boolean(owned.current),
    status: read ? status : "offline",
    error: read ? error : null,
    notice: read ? notice : null,
    now,
    connect(config: InstrumentSocketConfig) {
      if (!canInstrument(session) || connecting.current || owned.current?.socket.connected) return
      release()
      reset()
      setError(null)
      setNotice(null)
      setStatus("connecting")
      connecting.current = true
      try {
        const socket = io(config.url, {
          path: config.path,
          auth: config.auth,
          transports: ["websocket"],
          forceNew: true,
          autoConnect: false,
        })
        const current = () => owned.current?.socket === socket && canInstrument(session)
        let waitingForSnapshot = true
        // Socket.IO flushes buffered packets before notifying connect listeners.
        const beginSnapshot = () => {
          if (!waitingForSnapshot) return
          reset()
          waitingForSnapshot = false
        }
        const connected = () => {
          if (!current()) return
          connecting.current = false
          beginSnapshot()
          setNow(Date.now())
          setStatus("online")
          setError(null)
          setNotice({ key: "adminSessionStarted" })
        }
        const disconnected = () => {
          if (!current()) return
          connecting.current = false
          waitingForSnapshot = true
          setStatus("offline")
        }
        const failed = (value: Error) => {
          if (!current()) return
          if (!socket.active) {
            failure(value)
            return
          }
          connecting.current = false
          setStatus("error")
          setError(value.message)
          setNotice(null)
        }
        const received = (event: string, ...args: unknown[]) => {
          if (!current() || !socket.connected) return
          const parsed = parseInstrumentEvent(event, args)
          if (parsed) {
            beginSnapshot()
            update(applyInstrumentEvent(latest.current, parsed, Date.now()))
          }
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
      } catch (value) {
        failure(value)
      }
    },
    disconnect() {
      if (!canInstrument(session)) return
      release()
      reset()
      setStatus("offline")
      setError(null)
      setNotice(null)
    },
    kickClient(client: InstrumentClient) {
      if (
        !canInstrument(session) ||
        !owned.current?.socket.connected ||
        !latest.current.clients.some((item) => instrumentClientKey(item) === instrumentClientKey(client))
      )
        return
      try {
        owned.current.socket.emit("_disconnect", client.nsp, true, client.id)
        setNotice({ key: "disconnectCommandSent", value: client.id })
      } catch (value) {
        setError(value instanceof Error ? value.message : String(value))
      }
    },
    removeServer(id: string) {
      if (!canInstrument(session) || !owned.current?.socket.connected) return
      const server = latest.current.servers.get(id)
      if (!server || Date.now() - server.lastUpdate < 10000) return
      const servers = new Map(latest.current.servers)
      servers.delete(id)
      update({ ...latest.current, servers })
      setNotice({ key: "serverRemoved", value: id })
    },
  }
}
