// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, expect, test, vi } from "vitest"
import { useAuthStore } from "@/stores/auth"
import { useSocketInstrument } from "@/services/hooks/use-socket-instrument"
const transport = vi.hoisted(() => ({
  open: vi.fn(),
  instances: [] as {
    connected: boolean
    active: boolean
    handlers: Map<string, (...args: unknown[]) => void>
    any: ((event: string, ...args: unknown[]) => void) | null
    on: ReturnType<typeof vi.fn>
    off: ReturnType<typeof vi.fn>
    onAny: ReturnType<typeof vi.fn>
    offAny: ReturnType<typeof vi.fn>
    connect: ReturnType<typeof vi.fn>
    disconnect: ReturnType<typeof vi.fn>
    emit: ReturnType<typeof vi.fn>
  }[],
}))
vi.mock("socket.io-client", async (original) => ({
  ...(await original<typeof import("socket.io-client")>()),
  io: transport.open.mockImplementation(() => {
    const socket = {
      connected: false,
      active: false,
      handlers: new Map<string, (...args: unknown[]) => void>(),
      any: null as ((event: string, ...args: unknown[]) => void) | null,
      on: vi.fn(),
      off: vi.fn(),
      onAny: vi.fn(),
      offAny: vi.fn(),
      connect: vi.fn(),
      disconnect: vi.fn(),
      emit: vi.fn(),
    }
    socket.on.mockImplementation((event, fn) => socket.handlers.set(event, fn))
    socket.onAny.mockImplementation((fn) => {
      socket.any = fn
    })
    transport.instances.push(socket)
    return socket
  }),
}))
const config = {
  url: "https://instrument.example.test/admin",
  path: "/custom",
  auth: { username: "monitor", password: "explicit" },
}
const client = {
  id: "one",
  clientId: "engine-one",
  nsp: "/chat",
  transport: "websocket",
  handshake: {
    address: "127.0.0.1",
    headers: { host: "localhost" },
    time: "2026-10-24T01:00:00Z",
    url: "/socket.io/",
    query: { tag: ["a", "b"] },
  },
  rooms: ["one", "test"],
}
const stats = {
  serverId: "server-a",
  hostname: "host-a",
  pid: 42,
  uptime: 100,
  clientsCount: 1,
  pollingClientsCount: 0,
  namespaces: [{ name: "/chat", socketsCount: 1 }],
  aggregatedEvents: [{ timestamp: Date.now(), type: "bytesIn", count: 1024 }],
}
function setup() {
  useAuthStore.getState().setToken("access", "instrument-hook")
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
  return renderHook(() => useSocketInstrument())
}
afterEach(() => {
  cleanup()
  useAuthStore.getState().clearAuth()
  transport.open.mockClear()
  transport.instances.length = 0
  vi.useRealTimers()
})
test("instrument is lazy and independent, merges live protocol packets and sends disconnect commands to the actual client namespace", () => {
  const hook = setup()
  expect(transport.open).not.toHaveBeenCalled()
  act(() => hook.result.current.connect(config))
  expect(transport.open).toHaveBeenCalledWith("https://instrument.example.test/admin", {
    path: "/custom",
    auth: { username: "monitor", password: "explicit" },
    transports: ["websocket"],
    forceNew: true,
    autoConnect: false,
  })
  act(() => hook.result.current.connect(config))
  expect(transport.instances).toHaveLength(1)
  const socket = transport.instances[0]
  socket.connected = true
  act(() => socket.handlers.get("connect")?.())
  act(() => socket.any?.("all_sockets", [client]))
  act(() => socket.any?.("server_stats", stats))
  act(() => socket.any?.("event_received", "/chat", "one", ["message", false], new Date().toISOString()))
  expect(hook.result.current.status).toBe("online")
  expect(hook.result.current.data.clients[0].handshake.query).toEqual({ tag: ["a", "b"] })
  expect(hook.result.current.data.messages[0].args).toEqual([false])
  act(() => hook.result.current.kickClient(client))
  expect(socket.emit).toHaveBeenCalledWith("_disconnect", "/chat", true, "one")
  act(() => socket.any?.("socket_disconnected", "/chat", "one", "close", new Date().toISOString()))
  const count = socket.emit.mock.calls.length
  act(() => hook.result.current.kickClient(client))
  expect(socket.emit).toHaveBeenCalledTimes(count)
  act(() => hook.result.current.disconnect())
  expect(hook.result.current.data.traffic).toEqual([])
  expect(hook.result.current.data.servers.size).toBe(0)
  expect(socket.offAny).toHaveBeenCalledWith(socket.any)
  expect(socket.disconnect).toHaveBeenCalledTimes(1)
})
test("auth refusal releases the failed transport; reconnect clears old snapshots and rejects late callbacks from replaced connections", () => {
  const hook = setup()
  act(() => hook.result.current.connect(config))
  const first = transport.instances[0],
    late = first.any!
  act(() => first.handlers.get("connect_error")?.(new Error("authentication failed")))
  expect(hook.result.current.status).toBe("error")
  expect(hook.result.current.error).toBe("authentication failed")
  expect(first.disconnect).toHaveBeenCalledTimes(1)
  act(() => hook.result.current.connect(config))
  const socket = transport.instances[1]
  socket.connected = true
  act(() => socket.handlers.get("connect")?.())
  act(() => socket.any?.("server_stats", stats))
  socket.connected = false
  act(() => socket.handlers.get("disconnect")?.("transport close"))
  expect(hook.result.current.status).toBe("offline")
  socket.connected = true
  act(() => socket.handlers.get("connect")?.())
  expect(hook.result.current.data.servers.size).toBe(0)
  act(() => late("all_sockets", [client]))
  expect(hook.result.current.data.clients).toEqual([])
  hook.unmount()
  expect(socket.disconnect).toHaveBeenCalledTimes(1)
  expect(socket.off).toHaveBeenCalledWith("connect", expect.any(Function))
})
test("server removal becomes available after ten seconds, removes locally and never emits a destructive server command", () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-10-24T01:00:00Z"))
  const hook = setup()
  act(() => hook.result.current.connect(config))
  const socket = transport.instances[0]
  socket.connected = true
  act(() => socket.handlers.get("connect")?.())
  act(() => socket.any?.("server_stats", stats))
  act(() => hook.result.current.removeServer("server-a"))
  expect(hook.result.current.data.servers.has("server-a")).toBe(true)
  act(() => vi.advanceTimersByTime(11000))
  expect(hook.result.current.now).toBe(Date.now())
  act(() => hook.result.current.removeServer("server-a"))
  expect(hook.result.current.data.servers.size).toBe(0)
  expect(socket.emit).not.toHaveBeenCalled()
})
test("permission or identity loss hides old telemetry, closes ownership and blocks retained disconnect/client commands", () => {
  const hook = setup()
  act(() => hook.result.current.connect(config))
  const socket = transport.instances[0]
  socket.connected = true
  act(() => socket.handlers.get("connect")?.())
  act(() => socket.any?.("all_sockets", [client]))
  const late = socket.any!,
    kick = hook.result.current.kickClient,
    connect = hook.result.current.connect
  act(() => useAuthStore.setState({ userInfo: { ...useAuthStore.getState().userInfo!, buttons: [] } }))
  expect(hook.result.current.data.clients).toEqual([])
  expect(socket.disconnect).toHaveBeenCalledTimes(1)
  act(() => {
    kick(client)
    connect(config)
    late("all_sockets", [client])
  })
  expect(socket.emit).not.toHaveBeenCalled()
  expect(transport.instances).toHaveLength(1)
  act(() => useAuthStore.getState().setToken("other", "next-instrument-session"))
  act(() => connect(config))
  expect(transport.instances).toHaveLength(1)
  expect(hook.result.current.data.clients).toEqual([])
})

test("fresh pre-connect packets survive Socket.IO buffered delivery before the connect event, including after a transport reconnect", () => {
  const hook = setup()
  act(() => hook.result.current.connect(config))
  const socket = transport.instances[0]
  socket.connected = true
  act(() => socket.any?.("all_sockets", [client]))
  act(() => socket.handlers.get("connect")?.())
  expect(hook.result.current.data.clients.map((item) => item.id)).toEqual(["one"])
  act(() => socket.any?.("server_stats", stats))
  expect(hook.result.current.data.traffic).toHaveLength(1)
  socket.connected = false
  act(() => socket.handlers.get("disconnect")?.("transport close"))
  socket.connected = true
  act(() => socket.any?.("all_sockets", [{ ...client, id: "fresh", clientId: "engine-fresh", rooms: ["fresh"] }]))
  act(() => socket.handlers.get("connect")?.())
  expect(hook.result.current.data.clients.map((item) => item.id)).toEqual(["fresh"])
  expect(hook.result.current.data.traffic).toEqual([])
})

test("an offline owned transport remains cancellable and cannot reconnect through retained callbacks after cancellation", () => {
  const hook = setup()
  act(() => hook.result.current.connect(config))
  const socket = transport.instances[0]
  socket.connected = true
  act(() => socket.handlers.get("connect")?.())
  socket.connected = false
  act(() => socket.handlers.get("disconnect")?.("transport close"))
  expect(hook.result.current.status).toBe("offline")
  expect(hook.result.current.hasConnection).toBe(true)
  act(() => hook.result.current.disconnect())
  expect(hook.result.current.hasConnection).toBe(false)
  socket.connected = true
  act(() => socket.handlers.get("connect")?.())
  expect(hook.result.current.status).toBe("offline")
  expect(socket.disconnect).toHaveBeenCalledTimes(1)
})

test("transient reconnect errors keep an active transport retryable until it recovers or the user cancels", () => {
  const hook = setup()
  act(() => hook.result.current.connect(config))
  const socket = transport.instances[0]
  socket.active = true
  socket.connected = true
  act(() => socket.handlers.get("connect")?.())
  act(() => socket.any?.("server_stats", stats))
  socket.connected = false
  act(() => socket.handlers.get("disconnect")?.("transport close"))
  act(() => socket.handlers.get("connect_error")?.(new Error("timeout")))
  expect(hook.result.current.status).toBe("error")
  expect(hook.result.current.error).toBe("timeout")
  expect(hook.result.current.hasConnection).toBe(true)
  expect(socket.disconnect).not.toHaveBeenCalled()
  socket.connected = true
  act(() => socket.handlers.get("connect")?.())
  expect(hook.result.current.status).toBe("online")
  expect(hook.result.current.error).toBeNull()
  expect(hook.result.current.data.servers.size).toBe(0)
  socket.connected = false
  act(() => socket.handlers.get("disconnect")?.("transport close"))
  act(() => socket.handlers.get("connect_error")?.(new Error("network error")))
  act(() => hook.result.current.disconnect())
  expect(hook.result.current.hasConnection).toBe(false)
  expect(socket.disconnect).toHaveBeenCalledTimes(1)
})
