import { useEffect, useRef, useState } from "react"
import { usePermission } from "@/features/auth"
import { hasPermission } from "@/features/auth/permissions"
import { useAuthStore } from "@/stores/auth"
import { getAuthSession } from "@/services/auth-session"
import { openPrivateAppSocket, closeAppSocket } from "@/services/app-socket"
import {
  appendChatMessage,
  parseChatMessage,
  type ChatMessage,
  type ChatCharacter,
  type ChatRoom,
} from "@/views/socketio/chat/modules/chat-model"
function canChat(session: number) {
  const state = useAuthStore.getState()
  return session === getAuthSession() && Boolean(state.token) && hasPermission(state.userInfo, "socketio:read")
}
export function useChatWindow(username: ChatCharacter, group: ChatRoom) {
  useAuthStore((state) => state.token)
  const session = useRef(getAuthSession()).current
  const read = usePermission("socketio:read") && session === getAuthSession()
  const socket = useRef<ReturnType<typeof openPrivateAppSocket> | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [status, setStatus] = useState<"connecting" | "online" | "offline" | "error">("connecting")
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!read) return
    let active = true
    let instance: ReturnType<typeof openPrivateAppSocket> | undefined
    const current = () => active && canChat(session)
    const connected = () => {
      if (!current() || !instance) return
      setStatus("online")
      setError(null)
      instance.emit("join", group)
    }
    const disconnected = () => {
      if (current()) setStatus("offline")
    }
    const failed = (value: unknown) => {
      if (!current()) return
      setStatus("error")
      setError(value instanceof Error ? value.message : String(value))
    }
    const received = (value: unknown) => {
      if (!current()) return
      const message = parseChatMessage(value)
      if (message) setMessages((previous) => appendChatMessage(previous, message))
    }
    queueMicrotask(() => {
      if (!current()) return
      instance = openPrivateAppSocket("/chat", { display_name: username }, { group })
      socket.current = instance
      instance.on("connect", connected)
      instance.on("disconnect", disconnected)
      instance.on("connect_error", failed)
      instance.on("message", received)
      if (instance.connected) connected()
    })
    return () => {
      active = false
      if (!instance) return
      instance.off("connect", connected)
      instance.off("disconnect", disconnected)
      instance.off("connect_error", failed)
      instance.off("message", received)
      closeAppSocket(instance)
      if (socket.current === instance) socket.current = null
    }
  }, [read, session, username, group])
  return {
    messages: read ? messages : [],
    status: read ? status : "offline",
    error: read ? error : null,
    send(content: string) {
      if (!canChat(session) || !socket.current?.connected || !content.trim()) return false
      socket.current.emit("message", { content, group })
      return true
    },
    reconnect() {
      if (!canChat(session) || !socket.current || socket.current.connected) return
      setStatus("connecting")
      setError(null)
      socket.current.connect()
    },
  }
}
