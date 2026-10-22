// @vitest-environment jsdom
import { createApp, h, nextTick, reactive } from "vue"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import MessagePopover from "../../src/components/notification/message-popover.vue"
import MessageItem from "../../src/components/notification/message-item.vue"

const navigation = vi.hoisted(() => ({ push: vi.fn(), action: vi.fn() }))
vi.mock("@/hooks/common/router", () => ({ useRouterPush: () => ({ routerPushByKey: navigation.push }) }))
vi.mock("@/utils/notification/action-nav", () => ({ navigateToAction: navigation.action }))
vi.mock("@/locales", () => ({ $t: (key: string) => key, getLocale: () => "en-US" }))
vi.mock("@/store/modules/notification", () => ({ useNotificationStore: () => store }))

const store = reactive({
  drawerVisible: false,
  activeTab: "all",
  latest: [] as Api.Notification.Message[],
  loading: false,
  badgeText: "0",
  hasUnread: false,
  sessionEpoch: 0,
  isRecalled: (message: Api.Notification.Message) => message.status === "recalled",
  openDrawer() {
    this.drawerVisible = true
  },
  closeDrawer() {
    this.drawerVisible = false
  },
  setTab(tab: string) {
    this.activeTab = tab
  },
  markAllRead: vi.fn(),
  markRead: vi.fn(),
})

let app: ReturnType<typeof createApp>
let host: HTMLDivElement

async function open() {
  host.querySelector("button")!.click()
  await nextTick()
  await nextTick()
}

function sampleMessage(overrides: Partial<Api.Notification.Message> = {}): Api.Notification.Message {
  return {
    id: "message-1",
    messageId: "source-1",
    title: "Test notification",
    content: "Message body",
    contentMode: "raw",
    category: "system.security",
    level: "info",
    mandatory: false,
    status: "published",
    readAt: null,
    archivedAt: null,
    createTime: "2026-10-12T10:30:00Z",
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  navigation.action.mockResolvedValue(true)
  store.drawerVisible = false
  store.activeTab = "all"
  store.latest = []
  store.loading = false
  store.hasUnread = false
  store.badgeText = "0"
  host = document.createElement("div")
  document.body.append(host)
  app = createApp({
    render: () =>
      h(
        MessagePopover,
        {},
        {
          trigger: ({ visible }: { visible: boolean }) => h("button", { "aria-expanded": visible }, "Notifications"),
        },
      ),
  })
  app.mount(host)
})

afterEach(() => {
  app.unmount()
  host.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe("notification panel interaction", () => {
  it.each([false, true])(
    "centers the expanded card without changing read state (reduced motion: %s)",
    async (reduced) => {
      vi.stubGlobal(
        "matchMedia",
        vi.fn(() => ({ matches: reduced })),
      )
      vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(function (this: HTMLElement) {
        return this.classList.contains("notification-preview-body") ? 200 : 1000
      })
      vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function (this: HTMLElement) {
        return this.classList.contains("n-scrollbar-container") ? 500 : 40
      })
      vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
        const card = this.classList.contains("notification-preview")
        return { top: card ? 360 : 0, height: card ? 300 : 500 } as DOMRect
      })
      store.latest = [sampleMessage()]
      await open()
      const scrollport = document.querySelector<HTMLElement>(".n-scrollbar-container")!
      scrollport.scrollTop = 140
      scrollport.scrollTo = vi.fn()
      document.querySelector<HTMLButtonElement>(".notification-preview-toggle")!.click()
      await nextTick()
      await nextTick()
      expect(scrollport.scrollTo).toHaveBeenCalledWith({ top: 400, behavior: reduced ? "auto" : "smooth" })
      scrollport.scrollTop = 400
      document.querySelector<HTMLButtonElement>(".notification-preview-toggle")!.click()
      await nextTick()
      await nextTick()
      expect(scrollport.scrollTo).toHaveBeenLastCalledWith({ top: 140, behavior: reduced ? "auto" : "smooth" })
      expect(store.markRead).not.toHaveBeenCalled()
    },
  )

  it("expands only from the disclosure button without marking read and restores the original list scroll", async () => {
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("notification-preview-body") ? 200 : 20
    })
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(40)
    const content = "完整通知内容\n".repeat(30)
    store.latest = [sampleMessage({ content, action: { type: "menu", route: "home", label: "查看计划" } })]
    await open()
    document.querySelector<HTMLButtonElement>(".notification-preview-content")!.click()
    await nextTick()
    expect(document.querySelector(".notification-preview-toggle")!.getAttribute("aria-expanded")).toBe("false")
    store.markRead.mockClear()
    const scrollport = document.querySelector<HTMLElement>(".n-scrollbar-container")!
    scrollport.scrollTop = 140
    scrollport.scrollTo = vi.fn((options?: ScrollToOptions | number) => {
      if (typeof options === "object") scrollport.scrollTop = options.top ?? 0
    })
    const toggle = document.querySelector<HTMLButtonElement>(".notification-preview-toggle")!
    expect(toggle).not.toBeNull()
    expect(toggle.getAttribute("aria-expanded")).toBe("false")
    toggle.click()
    await nextTick()
    expect(toggle.getAttribute("aria-expanded")).toBe("true")
    const region = document.getElementById(toggle.getAttribute("aria-controls")!)!
    expect(region.textContent).toContain(content)
    expect(region.textContent).not.toContain("Test notification")
    expect(document.querySelector(".notification-preview-expanded-header")!.textContent).toContain("Test notification")
    expect(region.getAttribute("tabindex")).toBe("0")
    expect(document.querySelector(".notification-preview-action")!.textContent).toContain("查看计划")
    expect(store.markRead).not.toHaveBeenCalled()
    expect(navigation.action).not.toHaveBeenCalled()
    store.latest[0].readAt = "2026-10-12T12:00:00Z"
    await nextTick()
    expect(toggle.getAttribute("aria-expanded")).toBe("true")
    scrollport.scrollTop = 300
    region.scrollTop = 90
    toggle.click()
    await nextTick()
    expect(toggle.getAttribute("aria-expanded")).toBe("false")
    expect(store.markRead).not.toHaveBeenCalled()
    expect(scrollport.scrollTop).toBe(140)
    expect(store.drawerVisible).toBe(true)
    toggle.click()
    await nextTick()
    await nextTick()
    expect(region.scrollTop).toBe(0)
    expect(store.markRead).not.toHaveBeenCalled()
  })

  it("omits disclosure for short messages", async () => {
    store.latest = [sampleMessage()]
    await open()
    expect(document.querySelector(".notification-preview-toggle")).toBeNull()
  })

  it("resets an expanded card when its content is recalled", async () => {
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("notification-preview-body") ? 200 : 20
    })
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(40)
    store.latest = [sampleMessage()]
    await open()
    document.querySelector<HTMLButtonElement>(".notification-preview-toggle")!.click()
    await nextTick()
    await nextTick()
    expect(document.querySelector(".notification-preview-toggle")!.getAttribute("aria-expanded")).toBe("true")
    store.latest[0].status = "recalled"
    await nextTick()
    await nextTick()
    expect(document.querySelector(".notification-preview-toggle")).toBeNull()
    expect(document.querySelector(".notification-preview-reading")).toBeNull()
    expect(document.querySelector(".notification-recalled")!.textContent).toContain("page.notification.recalled")
    expect(document.getElementById("notification-popover")!.innerHTML).not.toContain("Test notification")
    expect(document.getElementById("notification-popover")!.innerHTML).not.toContain("Message body")
  })

  it("hides a recalled long title without offering disclosure", async () => {
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("notification-preview-title") ? 200 : 20
    })
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(40)
    store.latest = [sampleMessage({ title: "Very long title ".repeat(30), status: "recalled" })]
    await open()
    expect(document.querySelector(".notification-preview-toggle")).toBeNull()
    const panel = document.getElementById("notification-popover")!
    expect(panel.innerHTML).not.toContain("Very long title")
    expect(panel.innerHTML).not.toContain("Message body")
    expect(panel.textContent).toContain("page.notification.recalled")
    expect(document.querySelector(".notification-preview-action")).toBeNull()
  })

  it("opens a single rounded surface without an arrow", async () => {
    await open()
    expect(document.getElementById("notification-popover")).not.toBeNull()
    expect(document.querySelector(".n-popover-arrow")).toBeNull()
    expect(host.querySelector("button")!.getAttribute("aria-expanded")).toBe("true")
  })

  it.each(["维护安排".repeat(64), "维护安排\n".repeat(32)])(
    "shows an overflowing title in a separate click popup without marking read: %s",
    async (title) => {
      vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(function (this: HTMLElement) {
        return this.classList.contains("notification-preview-title") ||
          this.classList.contains("notification-preview-expanded-title")
          ? 200
          : 20
      })
      vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(40)
      store.latest = [sampleMessage({ title })]
      await open()
      document.querySelector<HTMLElement>(".n-scrollbar-container")!.scrollTo = vi.fn()
      const toggle = document.querySelector<HTMLButtonElement>(".notification-preview-toggle")!
      toggle.click()
      await nextTick()
      await nextTick()
      const trigger = document.querySelector<HTMLButtonElement>(".notification-title-trigger")!
      expect(trigger).not.toBeNull()
      expect(trigger.getAttribute("aria-expanded")).toBe("false")
      trigger.click()
      await nextTick()
      await nextTick()
      const panel = document.querySelector<HTMLElement>(".notification-title-panel")!
      expect(panel).not.toBeNull()
      expect(panel.querySelector(".notification-title-full")!.textContent).toBe(title)
      expect(document.querySelector(".notification-preview-reading")!.textContent).toContain("Message body")
      expect(document.querySelector(".notification-preview-reading")!.textContent).not.toContain(title)
      expect(store.markRead).not.toHaveBeenCalled()
      panel.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
      await nextTick()
      expect(trigger.getAttribute("aria-expanded")).toBe("false")
      expect(store.drawerVisible).toBe(true)
      expect(document.activeElement).toBe(trigger)
      trigger.click()
      await nextTick()
      await nextTick()
      toggle.click()
      await nextTick()
      await nextTick()
      expect(document.querySelector(".notification-title-trigger")).toBeNull()
      expect(document.querySelector(".notification-title-panel")).toBeNull()
      expect(store.drawerVisible).toBe(true)
      expect(store.markRead).not.toHaveBeenCalled()
    },
  )

  it("does not offer a title popup when only the body overflows", async () => {
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("notification-preview-body") ? 200 : 20
    })
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(40)
    store.latest = [sampleMessage()]
    await open()
    document.querySelector<HTMLButtonElement>(".notification-preview-toggle")!.click()
    await nextTick()
    await nextTick()
    expect(document.querySelector(".notification-title-trigger")).toBeNull()
  })

  it("focuses the panel on open and restores focus to the trigger with Escape", async () => {
    await open()
    expect(document.activeElement?.id).toBe("notification-popover")
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    await nextTick()
    expect(store.drawerVisible).toBe(false)
    expect(document.activeElement).toBe(host.querySelector("button"))
  })

  it("closes when clicking outside the panel", async () => {
    await open()
    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
    document.body.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }))
    document.body.click()
    await nextTick()
    expect(store.drawerVisible).toBe(false)
  })

  it("keeps read-all disabled for an empty unread inbox and forwards it when unread messages exist", async () => {
    await open()
    const readAll = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
      button.textContent?.includes("page.notification.readAll"),
    )!
    expect(readAll.disabled).toBe(true)
    store.hasUnread = true
    store.badgeText = "99+"
    await nextTick()
    expect(readAll.disabled).toBe(false)
    readAll.click()
    expect(store.markAllRead).toHaveBeenCalledOnce()
  })

  it("switches the segmented unread tab using the existing store action", async () => {
    await open()
    const unread = Array.from(document.querySelectorAll<HTMLElement>(".n-tabs-tab")).find((tab) =>
      tab.textContent?.includes("page.notification.tabs.unread"),
    )!
    unread.click()
    await nextTick()
    expect(store.activeTab).toBe("unread")
    expect(unread.classList.contains("n-tabs-tab--active")).toBe(true)
  })

  it.each([
    [false, "published"],
    [true, "published"],
    [true, "expired"],
  ] as const)("marks content read without navigating: action=%s, status=%s", async (withAction, status) => {
    const message = sampleMessage({
      status,
      action: withAction ? { type: "menu", route: "home", path: "/home" } : null,
    })
    store.latest = [message]
    await open()
    document.querySelector<HTMLElement>('[aria-label="Test notification"]')!.click()
    await nextTick()
    await nextTick()
    expect(store.markRead).toHaveBeenCalledWith(message.id)
    expect(navigation.action).not.toHaveBeenCalled()
    expect(store.drawerVisible).toBe(true)
    if (status !== "published") {
      expect(document.querySelector('[aria-label="Test notification"]')!.textContent).not.toContain("Message body")
    }
  })

  it("shows the configured action label as a separate button and navigates once", async () => {
    const message = sampleMessage({ action: { type: "menu", route: "home", path: "/home", label: "查看 API 监控" } })
    store.latest = [message]
    await open()
    const action = document.querySelector<HTMLButtonElement>(".notification-preview-action")!
    expect(action.textContent).toContain("查看 API 监控")
    expect(action.closest('[role="button"]')).toBeNull()
    expect(action.closest("button")!.parentElement?.closest("button")).toBeNull()
    action.click()
    action.click()
    await nextTick()
    await nextTick()
    expect(store.markRead).toHaveBeenCalledExactlyOnceWith(message.id)
    expect(navigation.action).toHaveBeenCalledExactlyOnceWith(message.action)
    expect(store.drawerVisible).toBe(false)
  })

  it("uses a translated fallback for a blank action label", async () => {
    store.latest = [sampleMessage({ action: { type: "external", url: "https://example.com", label: "  " } })]
    await open()
    expect(document.querySelector(".notification-preview-action")!.textContent).toContain(
      "page.notification.popover.openAction",
    )
  })

  it("disables the text action while navigation is pending", async () => {
    let finishRead!: () => void
    store.markRead.mockImplementationOnce(() => new Promise<void>((resolve) => (finishRead = resolve)))
    const message = sampleMessage({ action: { type: "menu", route: "home", path: "/home", label: "查看记录" } })
    store.latest = [message]
    await open()
    const action = document.querySelector<HTMLButtonElement>(".notification-preview-action")!
    action.click()
    await nextTick()
    expect(action.disabled).toBe(true)
    expect(action.getAttribute("aria-busy")).toBe("true")
    action.click()
    expect(store.markRead).toHaveBeenCalledExactlyOnceWith(message.id)
    expect(navigation.action).not.toHaveBeenCalled()
    finishRead()
    await nextTick()
    await nextTick()
    expect(navigation.action).toHaveBeenCalledExactlyOnceWith(message.action)
    expect(store.drawerVisible).toBe(false)
  })

  it.each([
    { action: null },
    { status: "expired", action: { type: "menu", route: "home", path: "/home" } },
    { status: "recalled", action: { type: "menu", route: "home", path: "/home" } },
    { expireAt: "2000-01-01T00:00:00Z", action: { type: "menu", route: "home", path: "/home" } },
  ] as Partial<Api.Notification.Message>[])("hides unavailable actions: %j", async (overrides) => {
    store.latest = [sampleMessage(overrides)]
    await open()
    expect(document.querySelector(".notification-preview-action")).toBeNull()
  })

  it("keeps the panel open and reports an unavailable destination", async () => {
    navigation.action.mockResolvedValue(false)
    const warning = vi.fn()
    window.$message = { warning } as unknown as typeof window.$message
    store.latest = [sampleMessage({ action: { type: "menu", route: "missing", path: "/missing", label: "查看记录" } })]
    await open()
    document.querySelector<HTMLButtonElement>(".notification-preview-action")!.click()
    await nextTick()
    await nextTick()
    expect(store.drawerVisible).toBe(true)
    expect(warning).toHaveBeenCalledWith("page.notification.actionUnavailable")
    delete window.$message
  })

  it("blocks cached action buttons while the list is loading", async () => {
    store.latest = [sampleMessage({ action: { type: "menu", route: "home", path: "/home", label: "查看记录" } })]
    await open()
    store.loading = true
    await nextTick()
    document.querySelector<HTMLButtonElement>(".notification-preview-action")!.click()
    await nextTick()
    expect(store.markRead).not.toHaveBeenCalled()
    expect(navigation.action).not.toHaveBeenCalled()
  })

  it("preserves full message-center row actions independently of compact action buttons", async () => {
    const select = vi.fn(),
      archive = vi.fn()
    const centerHost = document.createElement("div")
    host.append(centerHost)
    const centerApp = createApp({
      render: () => h(MessageItem, { message: sampleMessage(), onClick: select, onArchive: archive }),
    })
    centerApp.mount(centerHost)
    try {
      expect(centerHost.querySelector(".notification-preview")).toBeNull()
      const archiveButton = Array.from(centerHost.querySelectorAll("button")).find((button) =>
        button.textContent?.includes("page.notification.archive"),
      )!
      archiveButton.click()
      expect(archive).toHaveBeenCalledExactlyOnceWith("message-1")
      expect(select).not.toHaveBeenCalled()
      centerHost.querySelector<HTMLElement>('[role="button"]')!.click()
      expect(select).toHaveBeenCalledOnce()
    } finally {
      centerApp.unmount()
    }
  })

  it("retains cached messages without flashing a skeleton during fast requests and blocks stale clicks", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] })
    store.latest = [sampleMessage()]
    await open()
    store.loading = true
    await nextTick()
    await vi.advanceTimersByTimeAsync(120)
    expect(document.querySelector(".notification-loading")).toBeNull()
    const row = document.querySelector<HTMLElement>('[aria-label="Test notification"]')!
    expect(row).not.toBeNull()
    row.click()
    expect(store.markRead).not.toHaveBeenCalled()
    store.loading = false
    await nextTick()
    await vi.advanceTimersByTimeAsync(100)
    expect(document.querySelector(".notification-loading")).toBeNull()
    expect(document.querySelector('[aria-label="Test notification"]')).not.toBeNull()
    expect(document.querySelector("[inert]")).toBeNull()
  })

  it("delays slow-request skeletons and keeps them visible long enough to avoid a brief flash", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] })
    store.latest = [sampleMessage()]
    await open()
    store.loading = true
    await nextTick()
    await vi.advanceTimersByTimeAsync(179)
    expect(document.querySelector(".notification-loading")).toBeNull()
    await vi.advanceTimersByTimeAsync(1)
    expect(document.querySelector(".notification-loading")).not.toBeNull()
    store.loading = false
    await nextTick()
    await vi.advanceTimersByTimeAsync(199)
    expect(document.querySelector(".notification-loading")).not.toBeNull()
    await vi.advanceTimersByTimeAsync(1)
    expect(document.querySelector(".notification-loading")).toBeNull()
    expect(document.querySelector('[aria-label="Test notification"]')).not.toBeNull()
  })

  it("does not show an empty state while the initial request is pending and cancels timers on close", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] })
    store.loading = true
    await open()
    await vi.advanceTimersByTimeAsync(100)
    expect(document.querySelector(".n-empty")).toBeNull()
    store.drawerVisible = false
    store.loading = false
    await nextTick()
    await vi.advanceTimersByTimeAsync(500)
    await open()
    expect(document.querySelector(".notification-loading")).toBeNull()
    expect(document.querySelector(".n-empty")).not.toBeNull()
  })

  it("cancels a pending skeleton dismissal when a new request starts", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] })
    await open()
    store.loading = true
    await nextTick()
    await vi.advanceTimersByTimeAsync(180)
    store.loading = false
    await nextTick()
    await vi.advanceTimersByTimeAsync(50)
    store.loading = true
    await nextTick()
    await vi.advanceTimersByTimeAsync(200)
    expect(document.querySelector(".notification-loading")).not.toBeNull()
    store.loading = false
    await nextTick()
    expect(document.querySelector(".notification-loading")).toBeNull()
  })
})
