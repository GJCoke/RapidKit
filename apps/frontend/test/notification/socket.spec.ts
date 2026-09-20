import { beforeEach, describe, expect, it, vi } from "vitest"

type Listener = (...args: any[]) => unknown

class FakeSocket {
  connected = false
  listeners = new Map<string, Set<Listener>>()
  disconnect = vi.fn(() => {
    this.connected = false
    return this
  })
  removeAllListeners = vi.fn(() => {
    this.listeners.clear()
    return this
  })

  on(event: string, listener: Listener) {
    const listeners = this.listeners.get(event) ?? new Set()
    listeners.add(listener)
    this.listeners.set(event, listeners)
    return this
  }

  async emitFromServer(event: string, payload?: unknown) {
    await Promise.all([...this.listeners.get(event) ?? []].map((listener) => listener(payload)))
  }
}

const mocks = vi.hoisted(() => ({
  io: vi.fn(),
  calibrate: vi.fn(),
  onRealtimeNew: vi.fn(),
  onRealtimeRecalled: vi.fn(),
  onRealtimeUnreadCount: vi.fn(),
  reset: vi.fn(),
}))

vi.mock("socket.io-client", () => ({ io: mocks.io }))
vi.mock("@/store/modules/notification", () => ({
  useNotificationStore: () => ({
    calibrate: mocks.calibrate,
    onRealtimeNew: mocks.onRealtimeNew,
    onRealtimeRecalled: mocks.onRealtimeRecalled,
    onRealtimeUnreadCount: mocks.onRealtimeUnreadCount,
    reset: mocks.reset,
  }),
}))

import { connectNotificationSocket, disconnectNotificationSocket } from "@/store/modules/notification/shared"

describe("notification socket", () => {
  const sockets: FakeSocket[] = []

  beforeEach(() => {
    vi.stubGlobal("window", { location: { origin: "https://rapidkit.test" } })
    disconnectNotificationSocket()
    sockets.length = 0
    vi.clearAllMocks()
    mocks.io.mockImplementation(() => {
      const socket = new FakeSocket()
      sockets.push(socket)
      return socket
    })
  })

  it("is idempotent for repeated connects with the same token", () => {
    connectNotificationSocket("same-token")
    connectNotificationSocket("same-token")

    expect(mocks.io).toHaveBeenCalledTimes(1)
    expect(sockets[0].disconnect).not.toHaveBeenCalled()
  })

  it("calibrates on connect and forwards all notification events", async () => {
    const message = { id: "notification-1" } as Api.Notification.Message
    connectNotificationSocket("token")

    await sockets[0].emitFromServer("connect")
    await sockets[0].emitFromServer("notification:new", message)
    await sockets[0].emitFromServer("notification:recalled", { messageId: "message-1" })
    await sockets[0].emitFromServer("notification:unread-count", { count: 7 })

    expect(mocks.calibrate).toHaveBeenCalledOnce()
    expect(mocks.onRealtimeNew).toHaveBeenCalledWith(message)
    expect(mocks.onRealtimeRecalled).toHaveBeenCalledWith("message-1")
    expect(mocks.onRealtimeUnreadCount).toHaveBeenCalledWith(7)
  })

  it("removes listeners, disconnects, and resets notification state", () => {
    connectNotificationSocket("token")
    const socket = sockets[0]

    disconnectNotificationSocket()

    expect(socket.removeAllListeners).toHaveBeenCalledOnce()
    expect(socket.disconnect).toHaveBeenCalledOnce()
    expect(socket.listeners.size).toBe(0)
    expect(mocks.reset).toHaveBeenCalledOnce()
  })

  it("rebuilds an unconnected socket when the auth token changes", () => {
    connectNotificationSocket("old-token")
    const oldSocket = sockets[0]
    expect(oldSocket.connected).toBe(false)

    connectNotificationSocket("new-token")

    expect(oldSocket.removeAllListeners).toHaveBeenCalledOnce()
    expect(oldSocket.disconnect).toHaveBeenCalledOnce()
    expect(mocks.io).toHaveBeenCalledTimes(2)
    expect(mocks.io.mock.calls[1][1]).toMatchObject({ auth: { access_token: "new-token" } })
  })
})
