// @vitest-environment jsdom
import { createApp, nextTick } from "vue"
import { createPinia, setActivePinia } from "pinia"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { useNotificationStore } from "@/store/modules/notification"
import { connectNotificationSocket, disconnectNotificationSocket } from "@/store/modules/notification/shared"
import MessagesButton from "@/layouts/modules/global-header/components/messages-button.vue"

const api = vi.hoisted(() => ({ banner: vi.fn(), latest: vi.fn(), unread: vi.fn() }))
const transport = vi.hoisted(() => ({ socket: null as any }))
vi.mock("@/service/api", () => ({
  fetchGetTopBanner: api.banner,
  fetchGetNotifications: api.latest,
  fetchGetUnreadCount: api.unread,
  fetchReadAllNotifications: vi.fn(),
  fetchReadNotification: vi.fn(),
}))
vi.mock("@/store/modules/auth/shared", () => ({ getToken: () => "account" }))
vi.mock("@/hooks/common/app-socket", () => ({ openAppSocket: () => transport.socket, closeAppSocket: () => {} }))
vi.mock("@/locales", () => ({ $t: (key: string) => key }))
vi.mock("@/components/notification/message-popover.vue", () => ({ default: { render: () => null } }))
const flush = async () => {
  for (let i = 0; i < 10; i++) await nextTick()
}
let listeners: Map<string, (payload?: any) => void>
let app: ReturnType<typeof createApp> | undefined
let host: HTMLElement | undefined
function visibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, value: state })
  document.dispatchEvent(new Event("visibilitychange"))
}
beforeEach(() => {
  setActivePinia(createPinia())
  disconnectNotificationSocket()
  vi.clearAllMocks()
  visibility("visible")
  listeners = new Map()
  transport.socket = { on: (event: string, listener: (data: any) => void) => listeners.set(event, listener) }
  api.banner.mockResolvedValue({
    data: { current: null, revision: 1, serverNow: new Date().toISOString(), nextChangeAt: null },
    error: null,
  })
  api.latest.mockResolvedValue({ data: { items: [], nextCursor: null, size: 20 }, error: null })
  api.unread.mockResolvedValue({ data: { count: 0 }, error: null })
})
afterEach(() => {
  app?.unmount()
  app = undefined
  host?.remove()
  disconnectNotificationSocket()
  visibility("visible")
})

it("loads the banner once on startup and uses pushed unread counts instead of duplicate HTTP", async () => {
  host = document.createElement("div")
  app = createApp(MessagesButton)
  app.mount(host)
  connectNotificationSocket()
  await flush()
  listeners.get("connect")!()
  listeners.get("notification:unread-count")!({ count: 7 })
  await flush()
  expect(api.banner).toHaveBeenCalledTimes(1)
  expect(api.latest).toHaveBeenCalledTimes(1)
  expect(api.unread).not.toHaveBeenCalled()
  expect(useNotificationStore().unreadCount).toBe(7)
  listeners.get("connect")!()
  await flush()
  expect(api.banner).toHaveBeenCalledTimes(2)
  expect(api.latest).toHaveBeenCalledTimes(2)
  expect(api.unread).not.toHaveBeenCalled()
})

it("defers reconnect HTTP until visible while preserving realtime unread updates", async () => {
  connectNotificationSocket()
  listeners.get("connect")!()
  await flush()
  visibility("hidden")
  listeners.get("connect")!()
  listeners.get("notification:unread-count")!({ count: 4 })
  await flush()
  expect(api.banner).toHaveBeenCalledTimes(1)
  expect(api.latest).toHaveBeenCalledTimes(1)
  expect(useNotificationStore().unreadCount).toBe(4)
  visibility("visible")
  await flush()
  expect(api.banner).toHaveBeenCalledTimes(2)
  expect(api.latest).toHaveBeenCalledTimes(2)
})

it("shares overlapping inbox calibration when opening the popover during reconnect", async () => {
  let finish!: (value: unknown) => void
  api.latest.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  connectNotificationSocket()
  listeners.get("connect")!()
  const store = useNotificationStore()
  store.openDrawer()
  store.openDrawer()
  expect(api.latest).toHaveBeenCalledTimes(1)
  expect(api.unread).toHaveBeenCalledTimes(1)
  finish({ data: { items: [], nextCursor: null, size: 20 }, error: null })
  await flush()
  expect(store.loading).toBe(false)
})

it("falls back to HTTP once when the initial socket connection fails", async () => {
  connectNotificationSocket()
  listeners.get("connect_error")?.(new Error("unreachable"))
  await flush()
  listeners.get("connect_error")?.(new Error("unreachable"))
  await flush()
  expect(api.unread).toHaveBeenCalledTimes(1)
  expect(api.latest).toHaveBeenCalledTimes(1)
})

it("fetches a fresh inbox on reconnect instead of reusing a request from before disconnect", async () => {
  let finish!: (value: unknown) => void
  api.latest.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  connectNotificationSocket()
  listeners.get("connect")!()
  const message = { id: "missed", messageId: "missed", readAt: null, status: "published" }
  api.latest.mockResolvedValue({ data: { items: [message], nextCursor: null, size: 20 }, error: null })
  listeners.get("connect")!()
  await flush()
  expect(api.latest).toHaveBeenCalledTimes(2)
  expect(useNotificationStore().latest.map((item) => item.id)).toEqual(["missed"])
  finish({ data: { items: [], nextCursor: null, size: 20 }, error: null })
  await flush()
  expect(useNotificationStore().latest.map((item) => item.id)).toEqual(["missed"])
})
