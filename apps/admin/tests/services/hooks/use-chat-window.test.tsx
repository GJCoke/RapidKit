// @vitest-environment jsdom
import { StrictMode, type ReactNode } from "react"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, expect, test, vi } from "vitest"
import { useAuthStore } from "@/stores/auth"
import { useChatWindow } from "@/services/hooks/use-chat-window"
const sockets = vi.hoisted(() => ({
  open: vi.fn(),
  close: vi.fn(),
  instances: [] as {
    connected: boolean
    on: ReturnType<typeof vi.fn>
    off: ReturnType<typeof vi.fn>
    emit: ReturnType<typeof vi.fn>
    connect: ReturnType<typeof vi.fn>
    handlers: Map<string, (...args: unknown[]) => void>
  }[],
}))
vi.mock("@/services/app-socket", () => ({
  openPrivateAppSocket: sockets.open.mockImplementation(() => {
    const handlers = new Map<string, (...args: unknown[]) => void>()
    const socket = {
      connected: false,
      on: vi.fn((event: string, fn: (...args: unknown[]) => void) => handlers.set(event, fn)),
      off: vi.fn((event: string) => handlers.delete(event)),
      emit: vi.fn(),
      connect: vi.fn(),
      handlers,
    }
    sockets.instances.push(socket)
    return socket
  }),
  closeAppSocket: sockets.close,
}))
function setup() {
  useAuthStore.getState().setToken("access", "chat-hook")
  useAuthStore.setState({
    userInfo: {
      id: "reader",
      username: "reader",
      name: "Reader",
      email: "",
      isAdmin: false,
      roles: [],
      buttons: ["socketio:read"],
      createTime: "",
      updateTime: "",
    },
  })
}
afterEach(() => {
  cleanup()
  useAuthStore.getState().clearAuth()
  sockets.open.mockClear()
  sockets.close.mockClear()
  sockets.instances.length = 0
})
function deliver(event: string, ...args: unknown[]) {
  act(() => sockets.instances.at(-1)!.handlers.get(event)?.(...args))
}
test("StrictMode opens one private identity, joins on every connection, sends only online nonblank text and deduplicates received messages", async () => {
  setup()
  const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>
  const hook = renderHook(() => useChatWindow("Doraemon", "Nobis-Home"), { wrapper })
  await waitFor(() => expect(sockets.open).toHaveBeenCalledTimes(1))
  expect(sockets.open).toHaveBeenCalledWith("/chat", { display_name: "Doraemon" }, { group: "Nobis-Home" })
  expect(hook.result.current.send("offline")).toBe(false)
  sockets.instances[0].connected = true
  deliver("connect")
  expect(hook.result.current.status).toBe("online")
  expect(sockets.instances[0].emit).toHaveBeenCalledWith("join", "Nobis-Home")
  expect(hook.result.current.send("   ")).toBe(false)
  expect(hook.result.current.send("  original text  ")).toBe(true)
  expect(sockets.instances[0].emit).toHaveBeenCalledWith("message", {
    content: "  original text  ",
    group: "Nobis-Home",
  })
  const message = { id: "one", sender: "Nobita", time: "12:30:00", type: "text", content: "hello" }
  deliver("message", message)
  deliver("message", message)
  deliver("message", { ...message, type: "unknown" })
  expect(hook.result.current.messages).toHaveLength(1)
  sockets.instances[0].connected = false
  deliver("disconnect", "transport close")
  expect(hook.result.current.status).toBe("offline")
  act(() => hook.result.current.reconnect())
  expect(sockets.instances[0].connect).toHaveBeenCalledTimes(1)
  sockets.instances[0].connected = true
  deliver("connect")
  expect(sockets.instances[0].emit.mock.calls.filter((call) => call[0] === "join")).toHaveLength(2)
})
test("errors remain recoverable and permission/session loss closes ownership and rejects retained callbacks", async () => {
  setup()
  const hook = renderHook(() => useChatWindow("Nobita", "School"))
  await waitFor(() => expect(sockets.open).toHaveBeenCalled())
  const socket = sockets.instances[0],
    callback = socket.handlers.get("message")!
  deliver("connect_error", new Error("websocket error"))
  expect(hook.result.current.status).toBe("error")
  socket.connected = true
  deliver("connect")
  deliver("message", { id: "one", sender: "Nobita", time: "12:30:00", type: "text", content: "private" })
  expect(hook.result.current.messages).toHaveLength(1)
  act(() => useAuthStore.setState({ userInfo: { ...useAuthStore.getState().userInfo!, buttons: [] } }))
  expect(hook.result.current.messages).toEqual([])
  expect(sockets.close).toHaveBeenCalledWith(socket)
  expect(hook.result.current.send("forbidden")).toBe(false)
  act(() => useAuthStore.getState().setToken("other", "next-chat-session"))
  act(() => callback({ id: "late", sender: "Nobita", time: "12:31:00", type: "text", content: "late private" }))
  expect(hook.result.current.messages).toEqual([])
  hook.unmount()
  expect(socket.off).toHaveBeenCalledWith("message", callback)
})
