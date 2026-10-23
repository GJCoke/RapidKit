// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, expect, test, vi } from "vitest"
import { useAuthStore } from "@/stores/auth"
import { useSocketDebug } from "@/services/hooks/use-socket-debug"
const transport = vi.hoisted(() => ({
  open: vi.fn(),
  instances: [] as {
    connected: boolean
    id: string
    handlers: Map<string, (...args: unknown[]) => void>
    any: ((event: string, ...args: unknown[]) => void) | null
    on: ReturnType<typeof vi.fn>
    off: ReturnType<typeof vi.fn>
    onAny: ReturnType<typeof vi.fn>
    offAny: ReturnType<typeof vi.fn>
    emit: ReturnType<typeof vi.fn>
    connect: ReturnType<typeof vi.fn>
    disconnect: ReturnType<typeof vi.fn>
  }[],
}))
vi.mock("socket.io-client", async (original) => ({
  ...(await original<typeof import("socket.io-client")>()),
  io: transport.open.mockImplementation(() => {
    const socket = {
      connected: false,
      id: "debug-id",
      handlers: new Map<string, (...args: unknown[]) => void>(),
      any: null as ((event: string, ...args: unknown[]) => void) | null,
      on: vi.fn(),
      off: vi.fn(),
      onAny: vi.fn(),
      offAny: vi.fn(),
      emit: vi.fn(),
      connect: vi.fn(),
      disconnect: vi.fn(),
    }
    socket.on.mockImplementation((event, callback) => socket.handlers.set(event, callback))
    socket.onAny.mockImplementation((callback) => {
      socket.any = callback
    })
    transport.instances.push(socket)
    return socket
  }),
}))
const config = { url: "https://custom.example.test/room", path: "/transport", auth: { key: "explicit" } }
function setup() {
  useAuthStore.getState().setToken("access", "debug-hook")
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
  return renderHook(() => useSocketDebug())
}
afterEach(() => {
  cleanup()
  useAuthStore.getState().clearAuth()
  transport.open.mockClear()
  transport.instances.length = 0
})
test("debug transport is lazy, independent and explicit; incoming args and outgoing payloads preserve their shapes", () => {
  const hook = setup()
  expect(transport.open).not.toHaveBeenCalled()
  act(() => hook.result.current.connect(config))
  expect(transport.open).toHaveBeenCalledWith("https://custom.example.test/room", {
    path: "/transport",
    auth: { key: "explicit" },
    transports: ["websocket"],
    forceNew: true,
    autoConnect: false,
  })
  expect(hook.result.current.status).toBe("connecting")
  act(() => hook.result.current.connect(config))
  expect(transport.instances).toHaveLength(1)
  const socket = transport.instances[0]
  socket.connected = true
  act(() => socket.handlers.get("connect")?.())
  expect(hook.result.current.status).toBe("online")
  act(() => socket.any?.("single", false))
  act(() => socket.any?.("many", 0, { ok: true }))
  expect(hook.result.current.logs[0]).toMatchObject({ type: "receive", event: "many", data: [0, { ok: true }] })
  expect(hook.result.current.logs[1]).toMatchObject({ type: "receive", event: "single", data: false })
  act(() => {
    expect(hook.result.current.send("message", null)).toBe(true)
  })
  expect(socket.emit).toHaveBeenCalledWith("message", null)
  expect(hook.result.current.logs[0]).toMatchObject({ type: "send", event: "message", data: null })
  act(() => hook.result.current.clearLogs())
  expect(hook.result.current.logs).toEqual([])
})
test("connection failures and emit exceptions become logs; manual disconnect releases handlers and permits a fresh configuration", () => {
  const hook = setup()
  act(() => hook.result.current.connect(config))
  const socket = transport.instances[0]
  act(() => socket.handlers.get("connect_error")?.(new Error("refused")))
  expect(hook.result.current.status).toBe("error")
  expect(hook.result.current.logs[0]).toMatchObject({
    type: "error",
    message: { key: "connectionError", value: "refused" },
  })
  act(() => {
    expect(hook.result.current.send("message", {})).toBe(false)
  })
  socket.connected = true
  act(() => socket.handlers.get("connect")?.())
  socket.emit.mockImplementationOnce(() => {
    throw new Error("reserved event")
  })
  act(() => {
    expect(hook.result.current.send("connect", {})).toBe(false)
  })
  expect(hook.result.current.logs[0]).toMatchObject({
    type: "error",
    message: { key: "emitError", value: "reserved event" },
  })
  const late = socket.any!
  act(() => hook.result.current.disconnect())
  expect(hook.result.current.status).toBe("offline")
  expect(socket.offAny).toHaveBeenCalledWith(late)
  expect(socket.disconnect).toHaveBeenCalledTimes(1)
  const count = hook.result.current.logs.length
  act(() => late("late", "old"))
  expect(hook.result.current.logs).toHaveLength(count)
  act(() => hook.result.current.connect({ ...config, path: "/next" }))
  expect(transport.instances).toHaveLength(2)
  expect(socket.off).toHaveBeenCalledWith("connect", expect.any(Function))
  hook.unmount()
  expect(transport.instances[1].disconnect).toHaveBeenCalledTimes(1)
})
test("permission and identity loss immediately masks logs, releases private sockets and rejects retained actions/callbacks", () => {
  const hook = setup()
  act(() => hook.result.current.connect(config))
  const socket = transport.instances[0]
  socket.connected = true
  act(() => socket.handlers.get("connect")?.())
  act(() => socket.any?.("private", "secret"))
  const late = socket.any!,
    send = hook.result.current.send,
    connect = hook.result.current.connect
  act(() => useAuthStore.setState({ userInfo: { ...useAuthStore.getState().userInfo!, buttons: [] } }))
  expect(hook.result.current.logs).toEqual([])
  expect(socket.disconnect).toHaveBeenCalledTimes(1)
  act(() => {
    expect(send("message", "forbidden")).toBe(false)
    connect(config)
    late("private", "late")
  })
  expect(transport.instances).toHaveLength(1)
  act(() => useAuthStore.getState().setToken("other", "next-debug-session"))
  act(() => connect(config))
  expect(transport.instances).toHaveLength(1)
  expect(hook.result.current.logs).toEqual([])
})
