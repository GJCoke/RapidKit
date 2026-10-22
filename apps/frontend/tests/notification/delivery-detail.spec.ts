// @vitest-environment jsdom
import { createApp, h, nextTick } from "vue"
import { afterEach, describe, expect, it, vi } from "vitest"
import DeliveryOutcome from "@/views/notification/manage/deliveries/modules/delivery-outcome.vue"
import DeliveryDetail from "@/views/notification/manage/deliveries/modules/delivery-detail.vue"

vi.mock("@/locales", async () => {
  const { createI18n } = await import("vue-i18n")
  const page = (await import("../../src/locales/langs/zh-CN/page.json")).default
  const common = (await import("../../src/locales/langs/zh-CN/common.json")).default
  return {
    $t: createI18n({ legacy: false, locale: "zh-CN", messages: { "zh-CN": { page, common } } }).global.t,
    getLocale: () => "zh-CN",
  }
})

const base: Api.Notification.Delivery = {
  id: "0199f3d1-724a-7e80-9c12-0abc1200b001",
  messageId: "0199f3d1-724a-7e80-9c12-0abc1200a001",
  userId: "0199f3d1-724a-7e80-9c12-0abc1200c001",
  channel: "in_app",
  status: "sent",
  attemptCount: 1,
  createTime: "2026-10-13 14:41:00",
  updateTime: "2026-10-13 14:41:01",
  sentAt: "2026-10-13 14:41:01",
  nextAttemptAt: "2026-10-13 14:44:10",
  lockedUntil: "2026-10-13 14:43:00",
  lastErrorCode: "inapp_emit_failed",
}
let app: ReturnType<typeof createApp> | undefined
let host: HTMLDivElement
function show(overrides: Partial<Api.Notification.Delivery>) {
  host = document.createElement("div")
  document.body.append(host)
  app = createApp({ render: () => h(DeliveryOutcome, { row: { ...base, ...overrides } }) })
  app.mount(host)
  return host.textContent ?? ""
}
afterEach(() => {
  app?.unmount()
  host?.remove()
})

async function showDrawer(status: Api.Notification.Delivery["status"]) {
  host = document.createElement("div")
  document.body.append(host)
  const onReturn = vi.fn()
  const onVisible = vi.fn()
  app = createApp({
    render: () =>
      h(DeliveryDetail, {
        row: {
          ...base,
          status,
          message: {
            id: base.messageId,
            title: "测试消息",
            contentMode: "raw",
            category: "admin.announcement",
            status: "published",
            createTime: base.createTime,
          },
        },
        visible: true,
        canViewMessage: false,
        onReturnWorkbench: onReturn,
        "onUpdate:visible": onVisible,
      }),
  })
  app.mount(host)
  await nextTick()
  return { onReturn, onVisible, drawer: document.querySelector(".n-drawer")! }
}

describe("delivery detail actions", () => {
  it("returns failed deliveries to the workbench and closes without a retry action", async () => {
    const { onReturn, onVisible, drawer } = await showDrawer("dead")
    const buttons = Array.from(drawer.querySelectorAll("button"))
    expect(buttons.map((button) => button.textContent)).not.toContain("重试")
    buttons.find((button) => button.textContent?.includes("返回工作台"))!.click()
    await nextTick()
    expect(onReturn).toHaveBeenCalledOnce()
    expect(onVisible).toHaveBeenCalledWith(false)
  })
  it("keeps technical information folded and respects message-view permissions", async () => {
    const { drawer } = await showDrawer("sent")
    expect(drawer.textContent).toContain("测试消息")
    expect(drawer.textContent).not.toContain("查看消息")
    expect(drawer.textContent).not.toContain("返回工作台")
    expect(drawer.textContent).not.toContain(base.userId)
    expect(drawer.querySelector("details")?.open).toBe(false)
  })
})

describe("delivery result-first details", () => {
  it("shows completion and sent time while hiding stale failure / retry / lock fields", () => {
    const text = show({})
    expect(text).toContain("投递完成")
    expect(text).toContain("发送完成时间")
    expect(text).toContain("2026-10-13 14:41:01")
    expect(text).not.toContain("失败原因")
    expect(text).not.toContain("实时通道发送失败")
    expect(text).not.toContain("下次重试")
    expect(text).not.toContain("锁定截止")
  })
  it("shows automatic retry time and a readable reason without presenting a completed send", () => {
    const text = show({ status: "retrying", attemptCount: 2, sentAt: null })
    expect(text).toContain("等待自动重试")
    expect(text).toContain("下次重试")
    expect(text).toContain("2026-10-13 14:44:10")
    expect(text).toContain("实时通道发送失败")
    expect(text).not.toContain("发送完成时间")
    expect(text).not.toContain("inapp_emit_failed")
  })
  it("shows terminal failure with the actual update time instead of a stale next retry", () => {
    const text = show({ status: "dead", attemptCount: 5, updateTime: "2026-10-13 14:49:10", sentAt: null })
    expect(text).toContain("投递失败")
    expect(text).toContain("5 次")
    expect(text).toContain("2026-10-13 14:49:10")
    expect(text).toContain("实时通道发送失败")
    expect(text).not.toContain("下次重试")
    expect(text).not.toContain("2026-10-13 14:44:10")
  })
  it("labels the first scheduled attempt as planned execution, with zero attempts", () => {
    const text = show({ status: "pending", attemptCount: 0, sentAt: null, lastErrorCode: null })
    expect(text).toContain("等待投递")
    expect(text).toContain("计划执行时间")
    expect(text).toContain("0 次")
    expect(text).not.toContain("下次重试")
  })
  it("shows processing without exposing a lock deadline or declaring delivery completed", () => {
    const text = show({ status: "processing", sentAt: null, lastErrorCode: null })
    expect(text).toContain("正在投递")
    expect(text).toContain("最近更新")
    expect(text).not.toContain("发送完成时间")
    expect(text).not.toContain("锁定截止")
  })
  it("shows cancellation without a future retry or an unrelated failure reason", () => {
    const text = show({ status: "cancelled", attemptCount: 0, sentAt: null })
    expect(text).toContain("投递已取消")
    expect(text).not.toContain("下次重试")
    expect(text).not.toContain("失败原因")
  })
  it("falls back to the actual update time when the optional retry timestamp is missing", () => {
    const text = show({ status: "retrying", sentAt: null, nextAttemptAt: null })
    expect(text).toContain("最近更新")
    expect(text).toContain("2026-10-13 14:41:01")
    expect(text).not.toContain("下次重试时间")
    expect(text).not.toContain("—")
  })
})
