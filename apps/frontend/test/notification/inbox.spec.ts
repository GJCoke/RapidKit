import { beforeEach, describe, expect, it, vi } from "vitest"

const api = vi.hoisted(() => ({
  fetchArchiveNotification: vi.fn(),
  fetchDeleteNotification: vi.fn(),
  fetchGetNotifications: vi.fn(),
  fetchReadNotification: vi.fn(),
}))
const notificationStore = vi.hoisted(() => ({ refreshUnreadCount: vi.fn() }))

vi.mock("@/service/api", () => api)
vi.mock("@/store/modules/notification", () => ({ useNotificationStore: () => notificationStore }))

import { useInbox } from "@/views/notification/center/composables/use-inbox"

function message(id: string, level: Api.Notification.Level = "info"): Api.Notification.Message {
  return {
    id,
    messageId: `message-${id}`,
    category: "system",
    level,
    contentMode: "raw",
    title: "Title",
    content: "Body",
    mandatory: false,
    status: "published",
    expireAt: null,
    recalledAt: null,
    readAt: null,
    archivedAt: null,
    createTime: "2026-09-05T00:00:00Z",
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

describe("useInbox", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.fetchArchiveNotification.mockResolvedValue({ data: null, error: null })
    api.fetchDeleteNotification.mockResolvedValue({ data: null, error: null })
    api.fetchReadNotification.mockResolvedValue({ data: null, error: null })
    notificationStore.refreshUnreadCount.mockResolvedValue(undefined)
  })

  it("recalibrates the global unread count after deleting an unread item", async () => {
    api.fetchGetNotifications.mockResolvedValue(page([message("1")]))
    const inbox = useInbox()
    await inbox.load(true)

    expect(await inbox.deleteOne("1")).toBe(true)
    expect(notificationStore.refreshUnreadCount).toHaveBeenCalledOnce()
  })

  it("sends all filters to the server", async () => {
    api.fetchGetNotifications.mockResolvedValue(page([message("info"), message("error", "error")]))
    const inbox = useInbox()
    inbox.filters.value = {
      unreadOnly: true,
      archived: "all",
      category: "system",
      level: "error",
      createdFrom: "2026-09-01T00:00:00Z",
      createdTo: "2026-09-07T23:59:59Z",
    }

    await inbox.load(true)

    expect(api.fetchGetNotifications).toHaveBeenCalledWith({
      size: 20,
      unreadOnly: true,
      archived: "all",
      category: "system",
      level: "error",
      createdFrom: "2026-09-01T00:00:00Z",
      createdTo: "2026-09-07T23:59:59Z",
    })
    expect(inbox.visibleItems.value.map((item) => item.id)).toEqual(["info", "error"])
  })

  it("ignores duplicate load-more clicks while the page request is pending", async () => {
    api.fetchGetNotifications.mockResolvedValueOnce(page([message("1")], "cursor-1"))
    const nextPage = deferred<ReturnType<typeof page>>()
    api.fetchGetNotifications.mockReturnValueOnce(nextPage.promise)
    const inbox = useInbox()
    await inbox.load(true)

    const first = inbox.load()
    const duplicate = inbox.load()
    expect(api.fetchGetNotifications).toHaveBeenCalledTimes(2)
    nextPage.resolve(page([message("2")]))
    await Promise.all([first, duplicate])

    expect(inbox.items.value.map((item) => item.id)).toEqual(["1", "2"])
  })

  it("lets reset supersede a pending page and ignores its stale response", async () => {
    const stalePage = deferred<ReturnType<typeof page>>()
    const resetPage = deferred<ReturnType<typeof page>>()
    api.fetchGetNotifications.mockReturnValueOnce(stalePage.promise).mockReturnValueOnce(resetPage.promise)
    const inbox = useInbox()

    const stale = inbox.load()
    const reset = inbox.load(true)
    resetPage.resolve(page([message("fresh")]))
    await reset
    stalePage.resolve(page([message("stale")]))
    await stale

    expect(inbox.items.value.map((item) => item.id)).toEqual(["fresh"])
    expect(inbox.loading.value).toBe(false)
  })

  it("deduplicates messages when cursor pages overlap", async () => {
    api.fetchGetNotifications
      .mockResolvedValueOnce(page([message("1")], "cursor-1"))
      .mockResolvedValueOnce(page([message("1"), message("2")]))
    const inbox = useInbox()

    await inbox.load(true)
    await inbox.load()

    expect(inbox.items.value.map((item) => item.id)).toEqual(["1", "2"])
  })

  it("keeps an item when archive or delete fails", async () => {
    api.fetchGetNotifications.mockResolvedValue(page([message("1")]))
    api.fetchArchiveNotification.mockResolvedValue({ data: null, error: new Error("archive") })
    api.fetchDeleteNotification.mockResolvedValue({ data: null, error: new Error("delete") })
    const inbox = useInbox()
    await inbox.load(true)

    expect(await inbox.archiveOne("1")).toBe(false)
    expect(await inbox.deleteOne("1")).toBe(false)
    expect(inbox.items.value.map((item) => item.id)).toEqual(["1"])
  })
})
