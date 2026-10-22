// @vitest-environment jsdom
import { createApp, h, nextTick } from "vue"
import { afterEach, describe, expect, it, vi } from "vitest"
import DeliveryRecipient from "@/views/notification/manage/deliveries/modules/delivery-recipient.vue"
import DeliveryMessage from "@/views/notification/manage/deliveries/modules/delivery-message.vue"
import DeliveryTechnicalInfo from "@/views/notification/manage/deliveries/modules/delivery-technical-info.vue"
import {
  deliveryError,
  deliveryMessageTitle,
} from "@/views/notification/manage/deliveries/modules/delivery-presentation"

const settings = vi.hoisted(() => ({ locale: "zh-CN" }))
vi.mock("@/locales", async () => {
  const { createI18n } = await import("vue-i18n")
  const page = (await import("../../src/locales/langs/zh-CN/page.json")).default
  const common = (await import("../../src/locales/langs/zh-CN/common.json")).default
  return {
    $t: createI18n({ legacy: false, locale: "zh-CN", messages: { "zh-CN": { page, common } } }).global.t,
    getLocale: () => settings.locale,
  }
})

const message: Api.Notification.DeliveryMessage = {
  id: "0199f3d1-724a-7e80-9c12-0abc1200a001",
  title: "维护通知",
  category: "admin.announcement",
  contentMode: "local",
  titles: { "zh-CN": "系统维护通知", "en-US": "System maintenance" },
  defaultLocale: "zh-CN",
  status: "published",
  createTime: "2026-10-13 15:00:00",
  publishedAt: "2026-10-13 15:00:00",
}
const row: Api.Notification.Delivery = {
  id: "0199f3d1-724a-7e80-9c12-0abc1200b001",
  messageId: message.id,
  userId: "0199f3d1-724a-7e80-9c12-0abc1200c001",
  createTime: "2026-10-13 15:00:00",
  updateTime: "2026-10-13 15:00:00",
  channel: "in_app",
  status: "dead",
  attemptCount: 5,
  lastErrorCode: "inapp_emit_failed",
  message,
  recipient: { name: "张三", username: "zhangsan", department: "研发部", state: "active" },
}
let app: ReturnType<typeof createApp> | undefined
let host: HTMLDivElement
function mount(component: Parameters<typeof h>[0], props: Record<string, unknown>) {
  host = document.createElement("div")
  document.body.append(host)
  app = createApp({ render: () => h(component, props) })
  app.mount(host)
  return host
}
afterEach(() => {
  app?.unmount()
  host?.remove()
  settings.locale = "zh-CN"
  vi.restoreAllMocks()
})

describe("readable delivery identities", () => {
  it("shows recipient identity and department rather than an opaque user ID", () => {
    mount(DeliveryRecipient, { recipient: row.recipient })
    expect(host.textContent).toContain("张三")
    expect(host.textContent).toContain("@zhangsan")
    expect(host.textContent).toContain("研发部")
    expect(host.textContent).not.toContain(row.userId)
  })
  it("falls back to username and keeps disabled recipients identifiable", () => {
    mount(DeliveryRecipient, { recipient: { ...row.recipient, name: "", state: "disabled" } })
    expect(host.textContent).toContain("zhangsan")
    expect(host.textContent).toContain("已停用")
  })
  it("labels deleted users without inventing a name or exposing an ID", () => {
    mount(DeliveryRecipient, { recipient: { name: "", username: "", department: "", state: "deleted" } })
    expect(host.textContent).toContain("用户已删除")
    expect(host.textContent).not.toContain("@")
    expect(host.textContent).not.toContain(row.userId)
  })
  it("renders the message title and metadata without the message UUID", () => {
    mount(DeliveryMessage, { message })
    expect(host.textContent).toContain("系统维护通知")
    expect(host.textContent).toContain("已发布")
    expect(host.textContent).toContain("2026-10-13")
    expect(host.textContent).not.toContain(message.id)
  })
  it("uses the requested title language and falls back to the default language", () => {
    settings.locale = "en-US"
    expect(deliveryMessageTitle(message)).toBe("System maintenance")
    settings.locale = "fr-FR"
    expect(deliveryMessageTitle(message)).toBe("系统维护通知")
  })
  it("keeps UUIDs and raw error codes hidden until technical information is expanded", async () => {
    mount(DeliveryTechnicalInfo, { row })
    expect(host.textContent).not.toContain(row.userId)
    expect(host.textContent).not.toContain(row.lastErrorCode)
    const details = host.querySelector("details")!
    details.open = true
    details.dispatchEvent(new Event("toggle"))
    await nextTick()
    expect(host.textContent).toContain(row.userId)
    expect(host.textContent).toContain(row.lastErrorCode)
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal("navigator", { clipboard: { writeText } })
    const button = Array.from(host.querySelectorAll("button")).find((item) =>
      item.getAttribute("aria-label")?.includes("用户 ID"),
    )!
    button.click()
    await nextTick()
    expect(writeText).toHaveBeenCalledWith(row.userId)
    vi.unstubAllGlobals()
  })
  it("keeps unknown technical errors out of the default result description", () => {
    expect(deliveryError("unmapped_internal_error")).not.toContain("unmapped_internal_error")
  })
})
