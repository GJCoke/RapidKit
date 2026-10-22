// @vitest-environment jsdom
import { createApp, h, nextTick, reactive } from "vue"
import { afterEach, describe, expect, it, vi } from "vitest"
import MessageItem from "@/components/notification/message-item.vue"
import GlobalAnnouncement from "@/layouts/modules/global-announcement/index.vue"

vi.mock("@/locales", () => ({ $t: (key: string) => key, getLocale: () => "en-US" }))
vi.mock("@/utils/notification/action-nav", () => ({ navigateToAction: vi.fn() }))
vi.mock("@/store/modules/banner", () => ({ useBannerStore: () => banner }))

const banner = reactive({ current: null as Api.Notification.TopBanner["current"] })
const mounted: Array<{ app: ReturnType<typeof createApp>; host: HTMLDivElement }> = []

function mount(component: Parameters<typeof h>[0], props: Record<string, unknown> = {}) {
  const host = document.createElement("div")
  document.body.append(host)
  const app = createApp({ render: () => h(component, props) })
  app.mount(host)
  mounted.push({ app, host })
  return host
}

function message(contentMode: Api.Notification.ContentMode): Api.Notification.Message {
  return {
    id: "inbox-1",
    messageId: "message-1",
    title: "PRIVATE_TITLE",
    content: "PRIVATE_BODY",
    contentMode,
    contentParams: {
      defaultLocale: "en-US",
      translations: { "en-US": { title: "PRIVATE_LOCAL_TITLE {secret}", content: "PRIVATE_LOCAL_BODY {secret}" } },
      parameters: { secret: "PRIVATE_PARAM" },
    },
    category: "system.security",
    level: "error",
    mandatory: true,
    action: { type: "menu", route: "home", label: "PRIVATE_ACTION" },
    status: "recalled",
    readAt: null,
    archivedAt: null,
    createTime: "2026-10-13T00:00:00Z",
  }
}

afterEach(() => {
  for (const { app, host } of mounted.splice(0)) {
    app.unmount()
    host.remove()
  }
  banner.current = null
})

describe("recalled notification presentation", () => {
  it.each([
    ["raw", true],
    ["raw", false],
    ["local", true],
    ["local", false],
    ["i18n", true],
    ["i18n", false],
  ] as const)("hides original %s content in compact=%s, including inaccessible DOM", async (mode, compact) => {
    const select = vi.fn()
    const host = mount(MessageItem, { message: message(mode), compact, onClick: select })
    await nextTick()

    expect(host.textContent).toContain("page.notification.recalled")
    expect(host.querySelector("time")?.getAttribute("datetime")).toBe("2026-10-13T00:00:00Z")
    expect(host.innerHTML).not.toContain("PRIVATE_")
    expect(host.textContent).not.toContain("page.notification.mandatory")
    expect(host.textContent).not.toContain("page.notification.popover.required")
    expect(host.querySelector(".notification-preview-unread-dot")).toBeNull()
    expect(host.querySelector(".n-badge")).toBeNull()
    expect(host.querySelector(".notification-preview-toggle")).toBeNull()
    expect(host.querySelector(".notification-preview-action")).toBeNull()
    expect(host.querySelector('[role="button"]')).toBeNull()
    expect(select).not.toHaveBeenCalled()
  })

  it("keeps message-center archive and delete controls on a recalled placeholder", async () => {
    const archive = vi.fn()
    const host = mount(MessageItem, { message: message("raw"), onArchive: archive })
    const archiveButton = [...host.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("page.notification.archive"),
    )
    expect(archiveButton).toBeDefined()
    archiveButton!.click()
    await nextTick()
    expect(archive).toHaveBeenCalledWith("inbox-1")
    expect(host.textContent).toContain("page.notification.delete")
  })

  it("removes already-rendered original content when the message is recalled", async () => {
    const item = reactive({ ...message("raw"), status: "published" })
    const host = mount(MessageItem, { message: item, compact: true })
    expect(host.innerHTML).toContain("PRIVATE_TITLE")
    item.status = "recalled"
    await nextTick()
    expect(host.innerHTML).not.toContain("PRIVATE_")
    expect(host.textContent).toContain("page.notification.recalled")
  })

  it("closes an open banner detail and removes its content when the banner disappears", async () => {
    banner.current = { ...message("raw"), status: "published" } as Api.Notification.TopBanner["current"]
    const host = mount(GlobalAnnouncement)
    host.querySelector<HTMLButtonElement>("button")!.click()
    await nextTick()
    await nextTick()
    expect(document.querySelector(".n-modal")?.textContent).toContain("PRIVATE_TITLE")
    banner.current = null
    await nextTick()
    await nextTick()
    expect(host.querySelector("section")).toBeNull()
    expect(document.querySelector(".n-modal")?.textContent ?? "").not.toContain("PRIVATE_")
  })
})
