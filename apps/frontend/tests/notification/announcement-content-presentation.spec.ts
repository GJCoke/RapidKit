// @vitest-environment jsdom
import { createApp, h, nextTick, reactive, ref } from "vue"
import { createPinia, setActivePinia } from "pinia"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import MessageItem from "@/components/notification/message-item.vue"
import GlobalAnnouncement from "@/layouts/modules/global-announcement/index.vue"
import { useBannerStore } from "@/store/modules/banner"
import AnnouncementContentPreview from "@/views/notification/manage/announcements/modules/announcement-content-preview.vue"
import AnnouncementDetail from "@/views/notification/manage/announcements/modules/announcement-detail.vue"
import { createAnnouncementState } from "@/views/notification/manage/announcements/modules/announcement-editor"

const api = vi.hoisted(() => ({ detail: vi.fn(), banner: vi.fn(), locale: "zh-CN" }))
vi.mock("@/service/api", () => ({ fetchGetAnnouncement: api.detail, fetchGetTopBanner: api.banner }))
vi.mock("@/utils/notification/action-nav", () => ({ navigateToAction: vi.fn() }))
vi.mock("@/locales", async () => {
  const { createI18n } = await import("vue-i18n")
  const page = (await import("../../src/locales/langs/zh-CN/page.json")).default
  const common = (await import("../../src/locales/langs/zh-CN/common.json")).default
  const notification = (await import("../../src/locales/langs/zh-CN/notification.json")).default
  return {
    $t: createI18n({ locale: "zh-CN", legacy: false, messages: { "zh-CN": { page, common, notification } } }).global.t,
    getLocale: () => api.locale,
  }
})

const title = "长标题-" + "测".repeat(252)
const content = "开始标记\n" + "测".repeat(19_990) + "\n结束标记"
const timestamp = "2026-10-10T00:00:00Z"
const matchMediaDescriptor = Object.getOwnPropertyDescriptor(window, "matchMedia")
let app: ReturnType<typeof createApp> | undefined
let host: HTMLDivElement
let store: ReturnType<typeof useBannerStore> | undefined

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
})
afterAll(() => {
  if (matchMediaDescriptor) Object.defineProperty(window, "matchMedia", matchMediaDescriptor)
  else Reflect.deleteProperty(window, "matchMedia")
})
afterEach(() => {
  app?.unmount()
  app = undefined
  host?.remove()
  store?.reset()
  store = undefined
  vi.resetAllMocks()
  api.locale = "zh-CN"
})
async function settle() {
  await nextTick()
  await nextTick()
  await nextTick()
}
function mount(render: () => ReturnType<typeof h>) {
  host = document.createElement("div")
  document.body.append(host)
  app = createApp({ render })
  app.mount(host)
}
function message(): Api.Notification.Message {
  return {
    id: "recipient-1",
    messageId: "announcement-1",
    category: "admin.announcement",
    level: "warning",
    contentMode: "raw",
    title,
    content,
    mandatory: false,
    status: "published",
    createTime: timestamp,
  }
}
function detail(id = "announcement-1"): Api.Notification.AnnouncementDetail {
  return {
    id,
    source: "admin",
    category: "admin.announcement",
    displayMode: "inbox",
    level: "warning",
    contentMode: "raw",
    title,
    content,
    status: "published",
    mandatory: false,
    channels: ["in_app"],
    audiences: [{ type: "all", includeDescendants: false }],
    createTime: timestamp,
    updateTime: timestamp,
    publishedAt: timestamp,
  }
}

// DOM tests verify complete text and user interaction; real layout/overflow needs browser acceptance.
describe("long announcement content presentation", () => {
  it("switches title, body and button together and shows the button's default-language fallback", async () => {
    const state = reactive(createAnnouncementState())
    state.contentMode = "local"
    state.actionEnabled = true
    state.localized.translations = {
      "zh-CN": { title: "维护通知", content: "维护正文" },
      "en-US": { title: "Maintenance", content: "Maintenance body" },
    }
    state.actionLabels = { "zh-CN": "查看详情", "en-US": "View details" }
    mount(() => h(AnnouncementContentPreview, { state }))
    expect(host.textContent).toContain("查看详情")
    state.localized.previewLocale = "en-US"
    await settle()
    expect(host.textContent).toContain("Maintenance body")
    expect(host.textContent).toContain("View details")
    state.actionLabels["en-US"] = ""
    await settle()
    expect(host.textContent).toContain("查看详情")
    expect(host.textContent).toContain("按钮使用默认语言：简体中文")
  })

  it("renders persisted snake-case button translations in the recipient's language", () => {
    api.locale = "en-US"
    const item = message()
    item.action = {
      type: "external",
      url: "https://example.com",
      label: "查看详情",
      localized_label: { defaultLocale: "zh-CN", translations: { "zh-CN": "查看详情", "en-US": "View details" } },
    } as Api.Notification.ActionRef
    mount(() => h(MessageItem, { message: item, compact: true }))
    expect(host.querySelector(".notification-preview-action-label")?.textContent).toBe("View details")
  })

  it("keeps all 256 title and 20,000 body characters in the unsaved preview", () => {
    const state = createAnnouncementState()
    state.model.rawTitle = title
    state.model.rawContent = content
    mount(() => h(AnnouncementContentPreview, { state }))
    const preview = host.querySelector('[data-testid="announcement-content-preview"]')!
    const paragraphs = [...preview.querySelectorAll("p")].map((element) => element.textContent)
    expect(title.length).toBe(256)
    expect(content.length).toBe(20_000)
    expect(paragraphs).toContain(title)
    expect(paragraphs).toContain(content)
  })

  it("preserves newlines, literal braces, ampersands and Unicode without interpreting raw text", () => {
    const state = createAnnouncementState()
    state.model.rawTitle = "维护 & 说明 😀"
    state.model.rawContent = "第一行\n\n{username} & 1 < 2\n中文 / English / 😀"
    mount(() => h(AnnouncementContentPreview, { state }))
    expect([...host.querySelectorAll("p")].map((element) => element.textContent)).toContain(state.model.rawContent)
    expect(host.querySelector("script, img")).toBeNull()
  })

  it.each([false, true])(
    "retains complete message data and accessible selection controls (compact=%s)",
    async (compact) => {
      const item = message()
      const selected = vi.fn()
      mount(() => h(MessageItem, { message: item, compact, showActions: false, onClick: selected }))
      const row = host.querySelector<HTMLElement>(compact ? "button.notification-preview-content" : '[role="button"]')!
      expect(row.getAttribute("aria-label")).toBe(title)
      expect(row.querySelector(compact ? ".notification-preview-body" : "p")?.textContent?.trim()).toBe(content)
      row.click()
      if (compact) {
        // Native button keyboard activation is provided by the browser, not jsdom.
        expect(row).toBeInstanceOf(HTMLButtonElement)
      } else {
        row.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
        row.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }))
      }
      await settle()
      expect(selected).toHaveBeenCalledTimes(compact ? 1 : 3)
      for (const [value] of selected.mock.calls) expect(value).toEqual(item)
    },
  )

  it("loads full persisted text in management details", async () => {
    api.detail.mockResolvedValue({ data: detail(), error: null })
    const visible = ref(false)
    mount(() => h(AnnouncementDetail, { visible: visible.value, messageId: "announcement-1" }))
    visible.value = true
    await vi.waitFor(() => expect(document.querySelector(".n-drawer h2")?.textContent).toBe(title))
    expect(document.querySelector(".n-drawer p")?.textContent).toBe(content)
    expect(api.detail).toHaveBeenCalledWith("announcement-1")
  })

  it("discards a late detail response after selecting another announcement", async () => {
    let finish!: (value: unknown) => void
    api.detail.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    api.detail.mockResolvedValueOnce({
      data: { ...detail("new"), title: "新的公告", content: "新的内容" },
      error: null,
    })
    const visible = ref(false)
    const id = ref("old")
    mount(() => h(AnnouncementDetail, { visible: visible.value, messageId: id.value }))
    visible.value = true
    await settle()
    expect(api.detail).toHaveBeenCalledWith("old")
    id.value = "new"
    await vi.waitFor(() => expect(document.querySelector(".n-drawer h2")?.textContent).toBe("新的公告"))
    finish({ data: detail("old"), error: null })
    await settle()
    expect(document.querySelector(".n-drawer h2")?.textContent).toBe("新的公告")
    expect(document.querySelector(".n-drawer p")?.textContent).toBe("新的内容")
  })

  it("shows a detail load failure and reloads on reopening the same announcement", async () => {
    api.detail.mockResolvedValueOnce({ data: null, error: { message: "failed" } })
    api.detail.mockResolvedValueOnce({ data: detail(), error: null })
    const visible = ref(false)
    mount(() => h(AnnouncementDetail, { visible: visible.value, messageId: "announcement-1" }))
    visible.value = true
    await vi.waitFor(() => expect(document.querySelector(".n-drawer .n-alert")).not.toBeNull())
    expect(document.querySelector(".n-drawer h2")).toBeNull()
    visible.value = false
    await settle()
    visible.value = true
    await vi.waitFor(() => expect(document.querySelector(".n-drawer h2")?.textContent).toBe(title))
    expect(document.querySelector(".n-drawer .n-alert")).toBeNull()
    expect(api.detail).toHaveBeenCalledTimes(2)
  })

  it("opens the full top announcement and dismisses old details when it is replaced", async () => {
    setActivePinia(createPinia())
    store = useBannerStore()
    const current: Api.Notification.BannerSummary = {
      id: "banner-1",
      title,
      content,
      level: "warning",
      contentMode: "raw",
      status: "published",
      publishedAt: timestamp,
    }
    api.banner.mockResolvedValue({
      data: { current, serverNow: timestamp, revision: 1, nextChangeAt: null },
      error: null,
    })
    store.start("test-session")
    await settle()
    mount(() => h(GlobalAnnouncement))
    const region = host.querySelector('[role="region"]')!
    expect([...region.querySelectorAll("p")].map((element) => element.textContent)).toEqual([title, content])
    region.querySelector("button")!.click()
    await vi.waitFor(() => expect(document.querySelector(".n-card h2")?.textContent).toBe(title))
    expect(document.querySelector(".n-card p")?.textContent).toBe(content)
    store.snapshot = {
      revision: 2,
      serverNow: timestamp,
      nextChangeAt: null,
      current: { ...current, id: "banner-2", title: "替换公告", content: "替换内容" },
    }
    await settle()
    expect(host.querySelector('[role="region"]')?.textContent).toContain("替换公告")
    await vi.waitFor(() => expect(document.querySelector(".n-card h2")).toBeNull())
    host.querySelector<HTMLButtonElement>('[role="region"] button')!.click()
    await vi.waitFor(() => expect(document.querySelector(".n-card h2")?.textContent).toBe("替换公告"))
    expect(document.querySelector(".n-card p")?.textContent).toBe("替换内容")
  })

  it("uses the recipient's language for the top announcement button", async () => {
    api.locale = "en-US"
    setActivePinia(createPinia())
    store = useBannerStore()
    store.snapshot = {
      revision: 1,
      serverNow: timestamp,
      nextChangeAt: null,
      current: {
        id: "banner-1",
        title: "Maintenance",
        content: "Body",
        level: "info",
        contentMode: "raw",
        status: "published",
        publishedAt: timestamp,
        action: {
          type: "external",
          url: "https://example.com",
          label: "详情",
          localized_label: { defaultLocale: "zh-CN", translations: { "zh-CN": "详情", "en-US": "View details" } },
        } as Api.Notification.ActionRef,
      },
    }
    mount(() => h(GlobalAnnouncement))
    host.querySelector<HTMLButtonElement>('[role="region"] button')!.click()
    await vi.waitFor(() => expect(document.querySelector(".n-card")?.textContent).toContain("View details"))
  })

  it.each(["info", "success", "warning", "error"] as const)(
    "shows %s announcements without level or validity metadata",
    async (level) => {
      setActivePinia(createPinia())
      store = useBannerStore()
      store.snapshot = {
        revision: 1,
        serverNow: timestamp,
        nextChangeAt: null,
        current: {
          id: "banner-clean",
          title: "服务升级说明",
          content: "完整公告正文",
          level,
          contentMode: "raw",
          status: "published",
          publishedAt: timestamp,
          expireAt: "2099-10-12T00:00:00Z",
        },
      }
      mount(() => h(GlobalAnnouncement))
      const region = host.querySelector('[role="region"]')!
      expect(region.querySelector(".n-tag")).toBeNull()
      expect(region.classList.contains(`text-${level}`)).toBe(true)
      expect(region.classList.contains(`bg-${level}/10`)).toBe(true)
      region.querySelector<HTMLButtonElement>("button")!.click()
      await vi.waitFor(() => expect(document.querySelector(".n-card h2")?.textContent).toBe("服务升级说明"))
      const card = document.querySelector(".n-card")!
      expect(card.querySelector(".n-tag")).toBeNull()
      expect(card.textContent).toContain("完整公告正文")
      expect(card.textContent).not.toContain("有效")
      expect(card.textContent).not.toContain("2026-10-10")
      expect(card.textContent).not.toContain("2099-10-12")
    },
  )
})
