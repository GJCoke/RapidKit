import { beforeEach, afterEach, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({ token: "", refresh: vi.fn(), reset: vi.fn(), managers: [] as unknown[] }))
vi.mock("@/store/modules/auth/shared", () => ({ getToken: () => state.token }))
vi.mock("@/store/modules/auth", () => ({ useAuthStore: () => ({ resetStore: state.reset }) }))
vi.mock("@/service/request", () => ({ refreshAccessToken: state.refresh }))
vi.mock("socket.io-client", () => {
  class Socket {
    connected = false
    handlers = new Map<string, ((...args: unknown[]) => unknown)[]>()
    connect = vi.fn(() => this)
    disconnect = vi.fn(() => {
      this.connected = false
      this.fire("disconnect", "io client disconnect")
      return this
    })
    removeAllListeners = vi.fn(() => this.handlers.clear())
    auth: unknown
    constructor(auth: unknown) {
      this.auth = auth
    }
    on(event: string, fn: (...args: unknown[]) => unknown) {
      this.handlers.set(event, [...(this.handlers.get(event) || []), fn])
      return this
    }
    fire(event: string, ...args: unknown[]) {
      for (const fn of this.handlers.get(event) || []) fn(...args)
    }
  }
  class Manager {
    sockets = new Map<string, Socket>()
    constructor() {
      state.managers.push(this)
    }
    socket(namespace: string, opts: { auth: unknown }) {
      if (!this.sockets.has(namespace)) this.sockets.set(namespace, new Socket(opts.auth))
      return this.sockets.get(namespace)!
    }
  }
  return { Manager }
})
import { openAppSocket, resetAppSockets, useAppSocket } from "./app-socket"

type FakeSocket = ReturnType<typeof openAppSocket> & { fire(event: string, ...args: unknown[]): void }
const open = (ns: string) => openAppSocket(ns) as FakeSocket
const token = (exp: number) => `a.${btoa(JSON.stringify({ exp }))}.c`
const expired = (s: FakeSocket) => s.fire("connect_error", new Error("token_expired"))

beforeEach(() => {
  vi.stubGlobal("window", { location: { origin: "https://app.test" } })
  state.token = token(Date.now() / 1000 - 60)
  vi.clearAllMocks()
  state.managers.length = 0
})
afterEach(() => resetAppSockets())

it("shares one manager and reads the latest token on every handshake", () => {
  const root = open("/")
  open("/notifications")
  expect(state.managers).toHaveLength(1)
  state.token = "new-token"
  const callback = vi.fn()
  if (typeof root.auth === "function") root.auth(callback)
  expect(callback).toHaveBeenCalledWith({ access_token: "new-token" })
})

it("refreshes once across sockets and reconnects both", async () => {
  let finish!: (value: boolean) => void
  state.refresh.mockImplementation(
    () =>
      new Promise<boolean>((resolve) => {
        finish = resolve
      }),
  )
  const root = open("/"),
    notifications = open("/notifications")
  expired(root)
  expired(notifications)
  expect(state.refresh).toHaveBeenCalledOnce()
  finish(true)
  await vi.waitFor(() => expect(root.connect).toHaveBeenCalledTimes(2))
  expect(notifications.connect).toHaveBeenCalledTimes(2)
})

it("uses a fresh local token without another refresh", async () => {
  state.token = token(Date.now() / 1000 + 60)
  const socket = open("/")
  expired(socket)
  await vi.waitFor(() => expect(socket.connect).toHaveBeenCalledTimes(2))
  expect(state.refresh).not.toHaveBeenCalled()
})

it("stops after a second refusal until a successful connection", async () => {
  state.refresh.mockResolvedValue(true)
  const socket = open("/")
  expired(socket)
  await vi.waitFor(() => expect(socket.connect).toHaveBeenCalledTimes(2))
  expired(socket)
  expect(state.refresh).toHaveBeenCalledOnce()
  socket.fire("connect")
  expired(socket)
  expect(state.refresh).toHaveBeenCalledTimes(2)
})

it("resets auth on unauthorized and stops on forbidden or unknown errors", () => {
  const socket = open("/")
  socket.fire("connect_error", new Error("forbidden"))
  socket.fire("connect_error", new Error("unexpected"))
  expect(state.reset).not.toHaveBeenCalled()
  expect(socket.connect).toHaveBeenCalledOnce()
  socket.fire("connect_error", new Error("unauthorized"))
  expect(state.reset).toHaveBeenCalledOnce()
})

it("recovers after revoked followed by server disconnect", async () => {
  state.refresh.mockResolvedValue(true)
  const socket = open("/")
  socket.fire("auth:revoked", { code: "token_expired" })
  expect(state.refresh).not.toHaveBeenCalled()
  socket.fire("disconnect", "io server disconnect")
  await vi.waitFor(() => expect(socket.connect).toHaveBeenCalledTimes(2))
})

it("tears down page sockets and creates a new manager after identity change", () => {
  const page = useAppSocket()
  const socket = page.connect("/dashboard")
  resetAppSockets()
  expect(socket.disconnect).toHaveBeenCalledOnce()
  expect(socket.removeAllListeners).toHaveBeenCalledOnce()
  open("/worker")
  expect(state.managers).toHaveLength(2)
})

it("does not reconnect disposed sockets after an in-flight refresh", async () => {
  let finish!: (value: boolean) => void
  state.refresh.mockImplementation(
    () =>
      new Promise<boolean>((resolve) => {
        finish = resolve
      }),
  )
  const socket = open("/")
  expired(socket)
  resetAppSockets()
  finish(true)
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  expect(socket.connect).toHaveBeenCalledOnce()
})

it("restores recovery when a page namespace is reopened", async () => {
  state.refresh.mockResolvedValue(true)
  const page = useAppSocket()
  page.connect("/worker")
  page.disconnect()
  const socket = page.connect("/worker") as FakeSocket
  expired(socket)
  await vi.waitFor(() => expect(state.refresh).toHaveBeenCalledOnce())
})

it("does not resurrect an unmounted page while refresh finishes", async () => {
  let finish!: (value: boolean) => void
  state.refresh.mockImplementation(
    () =>
      new Promise<boolean>((resolve) => {
        finish = resolve
      }),
  )
  const page = useAppSocket()
  const socket = page.connect("/worker") as FakeSocket
  expired(socket)
  page.disconnect()
  finish(true)
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(socket.connect).toHaveBeenCalledOnce()
})
