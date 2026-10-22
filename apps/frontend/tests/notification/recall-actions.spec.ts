// @vitest-environment jsdom
import { createApp, h, nextTick } from "vue"
import { createPinia, setActivePinia } from "pinia"
import { createMemoryHistory, createRouter } from "vue-router"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import MessagePopover from "@/components/notification/message-popover.vue"
import NotificationCenter from "@/views/notification/center/index.vue"
import { useNotificationStore } from "@/store/modules/notification"
import { router } from "@/router"

const api = vi.hoisted(() => ({
  fetchArchiveNotification: vi.fn(),
  fetchDeleteNotification: vi.fn(),
  fetchGetNotifications: vi.fn(),
  fetchGetUnreadCount: vi.fn(),
  fetchReadAllNotifications: vi.fn(),
  fetchReadNotification: vi.fn(),
}))

vi.mock("@/service/api", () => api)
vi.mock("@/locales", () => ({ $t: (key: string) => key, getLocale: () => "en-US" }))
vi.mock("@/router", () => ({
  router: createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/inbox", name: "inbox", component: { render: () => h("p", "Inbox") } },
      { path: "/destination", name: "destination", component: { render: () => h("p", "Destination") } },
    ],
  }),
}))
vi.mock("@/hooks/common/router", () => ({
  useRouterPush: () => ({ routerPushByKey: (name: string) => router.push({ name }) }),
}))

function message(id = "inbox-1"): Api.Notification.Message {
  return {
    id,
    messageId: `source-${id}`,
    category: "system",
    level: "info",
    contentMode: "raw",
    title: `Notification ${id}`,
    content: "Message body",
    mandatory: false,
    status: "published",
    readAt: null,
    archivedAt: null,
    createTime: "2026-10-13T00:00:00Z",
    action: { type: "menu", route: "destination", path: "/destination", label: "Open destination" },
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

const mounted: Array<{ app: ReturnType<typeof createApp>; host: HTMLDivElement }> = []

async function mountSurface(surface: "popover" | "center") {
  const store = useNotificationStore()
  const host = document.createElement("div")
  document.body.append(host)
  const app = createApp({
    render: () =>
      surface === "center"
        ? h(NotificationCenter)
        : h(MessagePopover, {}, { trigger: () => h("button", "Notifications") }),
  })
  app.use(router)
  app.mount(host)
  mounted.push({ app, host })
  if (surface === "popover") store.drawerVisible = true
  await nextTick()
  await nextTick()
  return host
}

beforeEach(async () => {
  setActivePinia(createPinia())
  vi.resetAllMocks()
  api.fetchGetNotifications.mockResolvedValue({ data: { items: [message()], nextCursor: null, size: 20 }, error: null })
  api.fetchGetUnreadCount.mockResolvedValue({ data: { count: 0 }, error: null })
  api.fetchReadNotification.mockResolvedValue({ data: null, error: null })
  await router.push("/inbox")
})

afterEach(() => {
  for (const { app, host } of mounted.splice(0)) {
    app.unmount()
    host.remove()
  }
})

describe.each(["popover", "center"] as const)("%s notification actions", (surface) => {
  function clickAction(host: HTMLDivElement) {
    const selector = surface === "popover" ? ".notification-preview-action" : '[role="button"]'
    const target = (surface === "popover" ? document : host).querySelector<HTMLElement>(selector)
    expect(target).not.toBeNull()
    target!.click()
  }

  it("navigates an available notification action", async () => {
    const store = useNotificationStore()
    store.latest = [message()]
    const host = await mountSurface(surface)

    clickAction(host)

    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe("/destination"))
  })

  it("stays in the inbox when recall replaces the cached message during a pending read", async () => {
    const pending = deferred<{ data: null; error: null }>()
    api.fetchReadNotification.mockReturnValueOnce(pending.promise)
    const store = useNotificationStore()
    const original = message()
    store.latest = [original]
    const host = await mountSurface(surface)

    clickAction(host)
    await nextTick()
    await store.onRealtimeRecalled(original.messageId)
    await nextTick()
    expect(store.latest[0]).not.toBe(original)
    expect(original.status).toBe("published")
    pending.resolve({ data: null, error: null })
    await pending.promise
    await new Promise<void>((resolve) => setTimeout(resolve, 0))

    expect(router.currentRoute.value.path).toBe("/inbox")
    if (surface === "popover") {
      expect(store.drawerVisible).toBe(true)
      store.onRealtimeNew(message("inbox-2"))
      await nextTick()
      clickAction(host)
      await vi.waitFor(() => expect(router.currentRoute.value.path).toBe("/destination"))
    }
  })

  it("stays in the inbox when the session resets during a pending action", async () => {
    const pending = deferred<{ data: null; error: null }>()
    api.fetchReadNotification.mockReturnValueOnce(pending.promise)
    const store = useNotificationStore()
    store.latest = [message()]
    const host = await mountSurface(surface)
    clickAction(host)
    await nextTick()

    store.reset()
    pending.resolve({ data: null, error: null })
    await pending.promise
    await new Promise<void>((resolve) => setTimeout(resolve, 0))

    expect(router.currentRoute.value.path).toBe("/inbox")
  })
})

it("stays in the center when recall arrives during unread calibration after reading", async () => {
  const unread = deferred<{ data: { count: number }; error: null }>()
  api.fetchGetUnreadCount.mockReturnValueOnce(unread.promise).mockResolvedValueOnce({ data: { count: 0 }, error: null })
  const store = useNotificationStore()
  store.latest = [message()]
  const host = await mountSurface("center")
  host.querySelector<HTMLElement>('[role="button"]')!.click()
  await nextTick()
  await nextTick()

  await store.onRealtimeRecalled(message().messageId)
  unread.resolve({ data: { count: 1 }, error: null })
  await unread.promise
  await new Promise<void>((resolve) => setTimeout(resolve, 0))

  expect(router.currentRoute.value.path).toBe("/inbox")
})
