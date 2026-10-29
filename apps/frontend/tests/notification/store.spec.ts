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
    vi.resetAllMocks()
    api.fetchGetUnreadCount.mockResolvedValue(success({ count: 3 }))
    api.fetchGetNotifications.mockResolvedValue(success({ items: [message("1")], nextCursor: null, size: 20 }))
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
    api.fetchGetNotifications.mockResolvedValue(success({ items: [message("1")], nextCursor: null, size: 20 }))

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

  it.each(["raw", "local", "i18n"])("scrubs %s recalled content while retaining read state", async (contentMode) => {
    const store = useNotificationStore()
    store.latest = [
      message("1", {
        contentMode,
        contentParams: { secret: "hidden-value" },
        action: { type: "route", routeName: "home" },
        mandatory: true,
        readAt: "2026-09-05T01:00:00Z",
      }),
    ]

    await store.onRealtimeRecalled("message-1")

    expect(store.latest[0]).toMatchObject({
      status: "recalled",
      contentMode: "raw",
      title: "",
      content: "",
      contentParams: null,
      action: null,
      mandatory: false,
      readAt: "2026-09-05T01:00:00Z",
    })
  })

  it("removes recalled items immediately from unread and ignores duplicate recall", async () => {
    const store = useNotificationStore()
    store.activeTab = "unread"
    store.latest = [message("1"), message("2")]
    store.unreadCount = 2
    api.fetchGetUnreadCount.mockResolvedValue(success({ count: 1 }))

    const recall = store.onRealtimeRecalled("message-1")
    expect(store.latest.map((item) => item.id)).toEqual(["2"])
    await recall
    await store.onRealtimeRecalled("message-1")

    expect(store.unreadCount).toBe(1)
    expect(store.latest.map((item) => item.id)).toEqual(["2"])
  })

  it("ignores delayed pushes for a recalled message until the auth session resets", async () => {
    const store = useNotificationStore()
    api.fetchGetUnreadCount.mockResolvedValue(success({ count: 0 }))
    await store.onRealtimeRecalled("message-1")

    store.onRealtimeNew(message("1"))
    expect(store.latest).toEqual([])
    expect(store.unreadCount).toBe(0)

    store.reset()
    store.onRealtimeNew(message("1"))
    expect(store.latest[0].status).toBe("published")
    expect(store.unreadCount).toBe(1)
  })

  it("sanitizes a latest response that was fetched before recall", async () => {
    const pending = deferred<ReturnType<typeof success<Api.Notification.InboxPage>>>()
    api.fetchGetNotifications.mockReturnValue(pending.promise)
    const store = useNotificationStore()
    const request = store.refreshLatest()

    await store.onRealtimeRecalled("message-1")
    pending.resolve(success({ items: [message("1")], nextCursor: null, size: 20 }))
    await request

    expect(store.latest[0]).toMatchObject({ status: "recalled", title: "", content: "", readAt: null })
  })

  it("remembers recalls discovered by HTTP before a delayed push", async () => {
    api.fetchGetUnreadCount.mockResolvedValue(success({ count: 0 }))
    api.fetchGetNotifications.mockResolvedValue(
      success({ items: [message("1", { status: "recalled" })], nextCursor: null, size: 20 }),
    )
    const store = useNotificationStore()
    await store.refreshLatest()
    store.onRealtimeNew(message("1"))

    expect(store.latest[0]).toMatchObject({ status: "recalled", title: "", content: "" })
    expect(store.unreadCount).toBe(0)
  })

  it("immediately removes an HTTP-discovered recall from the known unread count", async () => {
    const pending = deferred<ReturnType<typeof success<{ count: number }>>>()
    api.fetchGetUnreadCount.mockReturnValueOnce(pending.promise)
    api.fetchGetNotifications.mockResolvedValueOnce(
      success({ items: [message("1", { status: "recalled" })], nextCursor: null, size: 20 }),
    )
    const store = useNotificationStore()
    store.latest = [message("1")]
    store.unreadCount = 1

    await store.refreshLatest()

    expect(store.unreadCount).toBe(0)
    pending.resolve(success({ count: 0 }))
    await pending.promise
  })

  it("invalidates pre-recall unread requests when HTTP discovers the recall", async () => {
    const stale = deferred<ReturnType<typeof success<{ count: number }>>>()
    const calibration = deferred<ReturnType<typeof success<{ count: number }>>>()
    api.fetchGetUnreadCount.mockReturnValueOnce(stale.promise).mockReturnValueOnce(calibration.promise)
    api.fetchGetNotifications.mockResolvedValueOnce(
      success({ items: [message("1", { status: "recalled" })], nextCursor: null, size: 20 }),
    )
    const store = useNotificationStore()
    store.latest = [message("1")]
    store.unreadCount = 1
    const oldRequest = store.refreshUnreadCount()

    await store.refreshLatest()
    stale.resolve(success({ count: 1 }))
    await oldRequest

    expect(store.unreadCount).toBe(0)
    calibration.resolve(success({ count: 0 }))
    await calibration.promise
  })

  it("prevents an old unread request from overwriting recall calibration", async () => {
    const stale = deferred<ReturnType<typeof success<{ count: number }>>>()
    api.fetchGetUnreadCount.mockReturnValueOnce(stale.promise).mockResolvedValueOnce(success({ count: 0 }))
    const store = useNotificationStore()
    const oldRequest = store.refreshUnreadCount()
    await store.onRealtimeRecalled("message-1")
    stale.resolve(success({ count: 1 }))
    await oldRequest

    expect(store.unreadCount).toBe(0)
  })

  it("keeps the newer realtime unread count when a pending recall calibration returns", async () => {
    const pending = deferred<ReturnType<typeof success<{ count: number }>>>()
    api.fetchGetUnreadCount.mockReturnValueOnce(pending.promise)
    const store = useNotificationStore()
    const recall = store.onRealtimeRecalled("message-1")
    store.onRealtimeUnreadCount(2)
    pending.resolve(success({ count: 3 }))
    await recall

    expect(store.unreadCount).toBe(2)
  })

  it("excludes recalled items from a stale unread HTTP response", async () => {
    const pending = deferred<ReturnType<typeof success<Api.Notification.InboxPage>>>()
    api.fetchGetNotifications.mockReturnValueOnce(pending.promise)
    const store = useNotificationStore()
    store.activeTab = "unread"
    const request = store.refreshLatest()
    await store.onRealtimeRecalled("message-1")
    pending.resolve(success({ items: [message("1"), message("2")], nextCursor: null, size: 20 }))
    await request

    expect(store.latest.map((item) => item.id)).toEqual(["2"])
  })

  it("preserves recalled readAt for individual and bulk read operations", async () => {
    const store = useNotificationStore()
    store.latest = [message("1", { status: "recalled" }), message("2")]
    await store.markRead("1")
    await store.markAllRead()

    expect(api.fetchReadNotification).not.toHaveBeenCalled()
    expect(store.latest[0].readAt).toBeNull()
    expect(store.latest[1].readAt).not.toBeNull()
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
    store.activeTab = "unread"
    const secondRequest = store.refreshLatest()
    second.resolve(success({ items: [message("second")], nextCursor: null, size: 20 }))
    await secondRequest
    expect(store.loading).toBe(true)

    first.resolve(success({ items: [message("first")], nextCursor: null, size: 20 }))
    await firstRequest
    expect(store.loading).toBe(false)
  })

  it("shares concurrent refreshes of the same inbox filter", async () => {
    const pending = deferred<ReturnType<typeof success<Api.Notification.InboxPage>>>()
    api.fetchGetNotifications.mockReturnValueOnce(pending.promise)
    const store = useNotificationStore()
    const first = store.refreshLatest()
    const second = store.refreshLatest()
    expect(api.fetchGetNotifications).toHaveBeenCalledTimes(1)
    pending.resolve(success({ items: [message("fresh")], nextCursor: null, size: 20 }))
    await Promise.all([first, second])
    expect(store.latest[0].id).toBe("fresh")
    expect(store.loading).toBe(false)
  })
})
