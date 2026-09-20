import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"

const api = vi.hoisted(() => ({
  fetchGetNotifications: vi.fn(),
  fetchGetUnreadCount: vi.fn(),
  fetchReadAllNotifications: vi.fn(),
  fetchReadNotification: vi.fn(),
}))

vi.mock("@/service/api", () => api)

import { useNotificationStore } from "@/store/modules/notification"

function message(id: string, overrides: Record<string, unknown> = {}): Api.Notification.Message {
  return {
    id,
    messageId: `message-${id}`,
    category: "system",
    level: "info",
    contentMode: "raw",
    title: "Title",
    content: "Body",
    mandatory: false,
    status: "published",
    readAt: null,
    archivedAt: null,
    createTime: "2026-09-05T00:00:00Z",
    ...overrides,
  }
}

function success<T>(data: T) {
  return { data, error: null }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe("notification store", () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    api.fetchGetUnreadCount.mockResolvedValue(success({ count: 3 }))
    api.fetchGetNotifications.mockResolvedValue(
      success({ items: [message("1")], nextCursor: null, size: 20 }),
    )
    api.fetchReadAllNotifications.mockResolvedValue(success(null))
    api.fetchReadNotification.mockResolvedValue(success(null))
  })

  it("calibrates unread count from the API and caps the badge at 99+", async () => {
    const store = useNotificationStore()

    await store.refreshUnreadCount()
    expect(store.unreadCount).toBe(3)
    expect(store.badgeText).toBe("3")

    store.unreadCount = 150
    expect(store.badgeText).toBe("99+")
  })

  it("uses the real unreadOnly query field", async () => {
    const store = useNotificationStore()
    store.activeTab = "unread"

    await store.refreshLatest()

    expect(api.fetchGetNotifications).toHaveBeenCalledWith({ size: 20, unreadOnly: true })
  })

  it("filters announcements locally because the backend has no category filter", async () => {
    api.fetchGetNotifications.mockResolvedValue(
      success({
        items: [message("1"), message("2", { category: "admin.announcement" })],
        nextCursor: null,
        size: 20,
      }),
    )
    const store = useNotificationStore()
    store.activeTab = "announcement"

    await store.refreshLatest()

    expect(api.fetchGetNotifications).toHaveBeenCalledWith({ size: 20 })
    expect(store.latest.map((item) => item.id)).toEqual(["2"])
  })

  it("does not duplicate a realtime message or increment unread twice", () => {
    const store = useNotificationStore()
    store.unreadCount = 1
    const incoming = message("9")

    store.onRealtimeNew(incoming)
    store.onRealtimeNew(incoming)

    expect(store.latest.map((item) => item.id)).toEqual(["9"])
    expect(store.unreadCount).toBe(2)
  })

  it("calibrates authoritative state when marking one notification fails", async () => {
    const store = useNotificationStore()
    store.latest = [message("1")]
    store.unreadCount = 5
    api.fetchReadNotification.mockResolvedValue({ data: null, error: new Error("failed") })
    api.fetchGetUnreadCount.mockResolvedValue(success({ count: 4 }))
    api.fetchGetNotifications.mockResolvedValue(
      success({ items: [message("1")], nextCursor: null, size: 20 }),
    )

    await store.markRead("1")

    expect(store.unreadCount).toBe(4)
    expect(store.latest[0].readAt).toBeNull()
  })

  it("calibrates authoritative state when marking all notifications fails", async () => {
    const store = useNotificationStore()
    store.latest = [message("1")]
    store.unreadCount = 5
    api.fetchReadAllNotifications.mockResolvedValue({ data: null, error: new Error("failed") })
    api.fetchGetUnreadCount.mockResolvedValue(success({ count: 5 }))

    await store.markAllRead()

    expect(store.unreadCount).toBe(5)
    expect(store.latest[0].readAt).toBeNull()
  })

  it("marks recalled cached messages inactive and recalibrates unread count", async () => {
    const store = useNotificationStore()
    store.latest = [message("1")]
    store.unreadCount = 1
    api.fetchGetUnreadCount.mockResolvedValue(success({ count: 0 }))

    await store.onRealtimeRecalled("message-1")

    expect(store.latest).toMatchObject([{ messageId: "message-1", status: "recalled", action: null }])
    expect(store.unreadCount).toBe(0)
  })

  it("always ends loading when latest refresh throws", async () => {
    const store = useNotificationStore()
    api.fetchGetNotifications.mockRejectedValue(new Error("network"))

    await expect(store.refreshLatest()).rejects.toThrow("network")
    expect(store.loading).toBe(false)
  })

  it("resets all transient notification state", () => {
    const store = useNotificationStore()
    store.unreadCount = 9
    store.drawerVisible = true
    store.activeTab = "announcement"
    store.latest = [message("1")]

    store.reset()

    expect(store.unreadCount).toBe(0)
    expect(store.drawerVisible).toBe(false)
    expect(store.activeTab).toBe("all")
    expect(store.latest).toEqual([])
    expect(store.loading).toBe(false)
  })

  it("does not apply unread or latest responses started before reset", async () => {
    const unread = deferred<ReturnType<typeof success<{ count: number }>>>()
    const latest = deferred<ReturnType<typeof success<Api.Notification.InboxPage>>>()
    api.fetchGetUnreadCount.mockReturnValue(unread.promise)
    api.fetchGetNotifications.mockReturnValue(latest.promise)
    const store = useNotificationStore()

    const unreadRequest = store.refreshUnreadCount()
    const latestRequest = store.refreshLatest()
    store.reset()
    unread.resolve(success({ count: 8 }))
    latest.resolve(success({ items: [message("stale")], nextCursor: null, size: 20 }))
    await Promise.all([unreadRequest, latestRequest])

    expect(store.unreadCount).toBe(0)
    expect(store.latest).toEqual([])
    expect(store.loading).toBe(false)
  })

  it("does not let an older tab response overwrite the latest tab", async () => {
    const allResponse = deferred<ReturnType<typeof success<Api.Notification.InboxPage>>>()
    const unreadResponse = deferred<ReturnType<typeof success<Api.Notification.InboxPage>>>()
    api.fetchGetNotifications.mockReturnValueOnce(allResponse.promise).mockReturnValueOnce(unreadResponse.promise)
    const store = useNotificationStore()

    const allRequest = store.refreshLatest()
    store.setTab("unread")
    await vi.waitFor(() => expect(api.fetchGetNotifications).toHaveBeenCalledTimes(2))
    unreadResponse.resolve(success({ items: [message("new")], nextCursor: null, size: 20 }))
    await unreadResponse.promise
    allResponse.resolve(success({ items: [message("old")], nextCursor: null, size: 20 }))
    await allRequest

    expect(store.latest.map((item) => item.id)).toEqual(["new"])
  })

  it("keeps loading true until every concurrent latest request settles", async () => {
    const first = deferred<ReturnType<typeof success<Api.Notification.InboxPage>>>()
    const second = deferred<ReturnType<typeof success<Api.Notification.InboxPage>>>()
    api.fetchGetNotifications.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const store = useNotificationStore()

    const firstRequest = store.refreshLatest()
    const secondRequest = store.refreshLatest()
    second.resolve(success({ items: [message("second")], nextCursor: null, size: 20 }))
    await secondRequest
    expect(store.loading).toBe(true)

    first.resolve(success({ items: [message("first")], nextCursor: null, size: 20 }))
    await firstRequest
    expect(store.loading).toBe(false)
  })
})
