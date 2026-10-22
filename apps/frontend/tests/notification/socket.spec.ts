import { beforeEach, describe, expect, it, vi } from "vitest"
import { createPinia, setActivePinia } from "pinia"

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
    await Promise.all([...(this.listeners.get(event) ?? [])].map((listener) => listener(payload)))
  }
}

const mocks = vi.hoisted(() => ({
  bannerStart: vi.fn(),
  bannerReset: vi.fn(),
  bannerRefresh: vi.fn(),
  bannerInvalidate: vi.fn(),
  io: vi.fn(),
  token: "token",
  calibrate: vi.fn(),
  onRealtimeNew: vi.fn(),
  onRealtimeRecalled: vi.fn(),
  onRealtimeUnreadCount: vi.fn(),
  reset: vi.fn(),
}))

const api = vi.hoisted(() => ({
  fetchGetNotifications: vi.fn(),
  fetchGetUnreadCount: vi.fn(),
  fetchReadAllNotifications: vi.fn(),
  fetchReadNotification: vi.fn(),
}))
vi.mock("@/service/api", () => api)

vi.mock("@/store/modules/banner", () => ({
  useBannerStore: () => ({
    start: mocks.bannerStart,
    reset: mocks.bannerReset,
    refresh: mocks.bannerRefresh,
    invalidate: mocks.bannerInvalidate,
  }),
}))

vi.mock("@/hooks/common/app-socket", () => ({
  openAppSocket: mocks.io,
  closeAppSocket: (socket: FakeSocket) => {
    socket.removeAllListeners()
    socket.disconnect()
  },
}))
vi.mock("@/store/modules/auth/shared", () => ({ getToken: () => mocks.token }))
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
    connectNotificationSocket()
    connectNotificationSocket()

    expect(mocks.io).toHaveBeenCalledTimes(1)
    expect(sockets[0].disconnect).not.toHaveBeenCalled()
  })

  it("calibrates on connect and forwards all notification events", async () => {
    const message = { id: "notification-1" } as Api.Notification.Message
    connectNotificationSocket()

    await sockets[0].emitFromServer("connect")
    await sockets[0].emitFromServer("notification:new", message)
    await sockets[0].emitFromServer("notification:recalled", { messageId: "message-1" })
    await sockets[0].emitFromServer("notification:unread-count", { count: 7 })

    await sockets[0].emitFromServer("announcement:banner_changed", { revision: 5 })
    expect(mocks.bannerRefresh).toHaveBeenCalledOnce()
    expect(mocks.bannerInvalidate).toHaveBeenCalledWith(5)
    expect(mocks.calibrate).toHaveBeenCalledOnce()
    expect(mocks.onRealtimeNew).toHaveBeenCalledWith(message)
    expect(mocks.onRealtimeRecalled).toHaveBeenCalledWith("message-1")
    expect(mocks.onRealtimeUnreadCount).toHaveBeenCalledWith(7)
  })

  it("removes listeners, disconnects, and resets notification state", () => {
    connectNotificationSocket()
    const socket = sockets[0]

    disconnectNotificationSocket()

    expect(socket.removeAllListeners).toHaveBeenCalledOnce()
    expect(socket.disconnect).toHaveBeenCalledOnce()
    expect(socket.listeners.size).toBe(0)
    expect(mocks.reset).toHaveBeenCalledOnce()
    expect(mocks.bannerReset).toHaveBeenCalledOnce()
  })

  it("keeps the existing socket when only the token changes", () => {
    connectNotificationSocket()
    mocks.token = "new-token"
    connectNotificationSocket()
    expect(mocks.io).toHaveBeenCalledExactlyOnceWith("/notifications")
    expect(sockets[0].disconnect).not.toHaveBeenCalled()
  })
  it("calibrates notifications missed during disconnect and deduplicates realtime replay", async () => {
    const actual = await vi.importActual<typeof import("@/store/modules/notification")>("@/store/modules/notification")
    setActivePinia(createPinia())
    const store = actual.useNotificationStore()
    mocks.calibrate.mockImplementation(store.calibrate)
    mocks.onRealtimeNew.mockImplementation(store.onRealtimeNew)
    api.fetchGetUnreadCount.mockResolvedValue({ data: { count: 0 }, error: null })
    api.fetchGetNotifications.mockResolvedValue({ data: { items: [], nextCursor: null, size: 20 }, error: null })
    connectNotificationSocket()
    await sockets[0].emitFromServer("connect")
    await vi.waitFor(() => expect(store.latest).toEqual([]))
    const missed = {
      id: "missed",
      messageId: "missed-message",
      title: "During disconnect",
      status: "published",
      readAt: null,
    } as Api.Notification.Message
    api.fetchGetUnreadCount.mockResolvedValue({ data: { count: 1 }, error: null })
    api.fetchGetNotifications.mockResolvedValue({ data: { items: [missed], nextCursor: null, size: 20 }, error: null })
    await sockets[0].emitFromServer("disconnect", "io server disconnect")
    await sockets[0].emitFromServer("connect")
    await vi.waitFor(() => expect(store.latest.map((message) => message.id)).toEqual(["missed"]))
    await sockets[0].emitFromServer("notification:new", missed)
    expect(store.latest.map((message) => message.id)).toEqual(["missed"])
    expect(store.unreadCount).toBe(1)
    expect(mocks.calibrate).toHaveBeenCalledTimes(2)
    expect(api.fetchGetUnreadCount).toHaveBeenCalledTimes(2)
    expect(api.fetchGetNotifications).toHaveBeenCalledTimes(2)
  })
})
