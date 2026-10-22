import { effectScope, type EffectScope } from "vue"
import { createPinia, setActivePinia } from "pinia"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const api = vi.hoisted(() => ({
  fetchArchiveNotification: vi.fn(),
  fetchDeleteNotification: vi.fn(),
  fetchGetNotifications: vi.fn(),
  fetchGetUnreadCount: vi.fn(),
  fetchReadAllNotifications: vi.fn(),
  fetchReadNotification: vi.fn(),
}))

vi.mock("@/service/api", () => api)

import { useNotificationStore } from "@/store/modules/notification"
import { useInbox } from "@/views/notification/center/composables/use-inbox"

function message(id: string, overrides: Partial<Api.Notification.Message> = {}): Api.Notification.Message {
  return {
    id,
    messageId: `message-${id}`,
    category: "system",
    level: "warning",
    contentMode: "local",
    title: "Private title",
    content: "Private body",
    contentParams: { secret: "Private parameter" },
    mandatory: true,
    action: { type: "external", url: "https://example.com/private" },
    status: "published",
    readAt: null,
    archivedAt: null,
    createTime: "2026-09-05T00:00:00Z",
    ...overrides,
  }
}

function page(items: Api.Notification.Message[], nextCursor: string | null = null) {
  return { data: { items, nextCursor, size: 20 }, error: null }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe("shared inbox recall state", () => {
  let scope: EffectScope

  beforeEach(() => {
    setActivePinia(createPinia())
    scope = effectScope()
    vi.resetAllMocks()
    api.fetchGetUnreadCount.mockResolvedValue({ data: { count: 0 }, error: null })
    api.fetchReadNotification.mockResolvedValue({ data: null, error: null })
    api.fetchDeleteNotification.mockResolvedValue({ data: null, error: null })
    api.fetchArchiveNotification.mockResolvedValue({ data: null, error: null })
  })

  afterEach(() => scope.stop())

  function inbox() {
    return scope.run(() => useInbox())!
  }

  it("immediately scrubs every cached center and popover item without changing pagination or readAt", async () => {
    api.fetchGetNotifications.mockResolvedValue(page([message("1"), message("2")], "next-page"))
    const center = inbox()
    const anotherCenter = inbox()
    const store = useNotificationStore()
    await Promise.all([center.load(true), anotherCenter.load(true), store.refreshLatest()])

    const recalled = store.onRealtimeRecalled("message-1")

    for (const items of [center.items.value, anotherCenter.items.value, store.latest]) {
      expect(items[0]).toMatchObject({
        status: "recalled",
        contentMode: "raw",
        title: "",
        content: "",
        contentParams: null,
        action: null,
        mandatory: false,
        readAt: null,
      })
      expect(items[1].status).toBe("published")
    }
    expect(center.nextCursor.value).toBe("next-page")
    await recalled
  })

  it("hides a recalled item in an active unread view while keeping its neutral cached placeholder", async () => {
    api.fetchGetNotifications.mockResolvedValue(page([message("1"), message("2")]))
    const center = inbox()
    center.filters.value = { unreadOnly: true }
    await center.load(true)

    await useNotificationStore().onRealtimeRecalled("message-1")

    expect(center.visibleItems.value.map((item) => item.id)).toEqual(["2"])
    expect(center.items.value[0]).toMatchObject({ status: "recalled", readAt: null, title: "" })
  })

  it("sanitizes stale HTTP pages after recall and remembers recalls seen only in the center", async () => {
    const pending = deferred<ReturnType<typeof page>>()
    api.fetchGetNotifications.mockReturnValueOnce(pending.promise)
    const center = inbox()
    const store = useNotificationStore()
    const request = center.load(true)
    await store.onRealtimeRecalled("message-1")
    pending.resolve(page([message("1"), message("2", { status: "recalled" })]))
    await request

    expect(center.items.value.map((item) => item.title)).toEqual(["", ""])
    store.onRealtimeNew(message("2"))
    expect(store.latest).toEqual([])
    expect(store.unreadCount).toBe(0)
  })

  it("does not mark a recalled placeholder read, including when recall arrives during the request", async () => {
    api.fetchGetNotifications.mockResolvedValue(page([message("1"), message("2")]))
    const center = inbox()
    const store = useNotificationStore()
    await center.load(true)
    await store.onRealtimeRecalled("message-1")
    expect(await center.readOne("1")).toBe(true)
    expect(api.fetchReadNotification).not.toHaveBeenCalled()

    const pendingRead = deferred<{ data: null; error: null }>()
    api.fetchReadNotification.mockReturnValueOnce(pendingRead.promise)
    const read = center.readOne("2")
    await store.onRealtimeRecalled("message-2")
    pendingRead.resolve({ data: null, error: null })
    await read

    expect(center.items.value.map((item) => item.readAt)).toEqual([null, null])
  })

  it("clears center caches on session reset and discards responses from the old session", async () => {
    api.fetchGetNotifications.mockResolvedValueOnce(page([message("1")], "next-page"))
    const center = inbox()
    const store = useNotificationStore()
    await center.load(true)
    const pending = deferred<ReturnType<typeof page>>()
    api.fetchGetNotifications.mockReturnValueOnce(pending.promise)
    const request = center.load()

    store.reset()
    expect(center.items.value).toEqual([])
    expect(center.nextCursor.value).toBeNull()
    pending.resolve(page([message("stale")]))
    await request

    expect(center.items.value).toEqual([])
    expect(center.loading.value).toBe(false)
  })

  it("keeps archive and delete available for recalled placeholders", async () => {
    api.fetchGetNotifications.mockResolvedValue(
      page([message("1", { status: "recalled" }), message("2", { status: "recalled" })]),
    )
    const center = inbox()
    await center.load(true)

    expect(await center.archiveOne("1")).toBe(true)
    expect(await center.deleteOne("2")).toBe(true)
    expect(center.visibleItems.value).toEqual([])
  })

  it("calibrates a recall discovered only by center HTTP and does not repeat the calibration", async () => {
    api.fetchGetNotifications.mockResolvedValue(page([message("1", { status: "recalled" })]))
    const center = inbox()
    const store = useNotificationStore()
    store.unreadCount = 1

    await center.load(true)
    await vi.waitFor(() => expect(store.unreadCount).toBe(0))
    await center.load(true)
    await store.onRealtimeRecalled("message-1")

    expect(api.fetchGetUnreadCount).toHaveBeenCalledTimes(1)
  })
})
