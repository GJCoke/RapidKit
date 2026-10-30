// @vitest-environment jsdom
import { createApp, h, nextTick } from "vue"
import { afterEach, expect, it, vi } from "vitest"
import Deliveries from "@/views/notification/manage/deliveries/index.vue"
import { setPlatformTimezone } from "@/utils/datetime"

const api = vi.hoisted(() => ({ list: vi.fn(), summary: vi.fn(), rows: vi.fn(), retry: vi.fn() }))
vi.mock("@/service/api", () => ({
  fetchGetAnnouncements: api.list,
  fetchDeliverySummary: api.summary,
  fetchGetNotificationDeliveries: api.rows,
  fetchRetryFailedDeliveries: api.retry,
}))
vi.mock("@/locales", () => ({ $t: (key: string) => key, getLocale: () => "en-US" }))
vi.mock("@/hooks/business/auth", () => ({ useAuth: () => ({ hasAuth: () => true, getActionContext: () => ({}) }) }))
vi.mock("@/hooks/business/table-actions/use-table-actions", () => ({ useTableActions: () => ({ column: () => [] }) }))
vi.mock("@/store/modules/app", () => ({ useAppStore: () => ({ isMobile: false, locale: "en-US" }) }))
vi.mock("@/store/modules/route", () => ({ useRouteStore: () => ({ searchMenus: [] }) }))

let app: ReturnType<typeof createApp> | undefined
let host: HTMLDivElement
const originalScrollTo = HTMLElement.prototype.scrollTo
async function settle() {
  for (let i = 0; i < 12; i++) await nextTick()
}
afterEach(() => {
  app?.unmount()
  host?.remove()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  HTMLElement.prototype.scrollTo = originalScrollTo
  delete window.$dialog
  setPlatformTimezone("UTC")
})

it("disables retries when time expires and rechecks a pending confirmation", async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-10-30T07:59:59Z"))
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
  HTMLElement.prototype.scrollTo = vi.fn()
  setPlatformTimezone("Asia/Shanghai")
  const message = {
    id: "0199f3d1-724a-7e80-9c12-0abc1200a001",
    title: "Maintenance",
    contentMode: "raw",
    status: "published",
    createTime: "2026-10-30T07:00:00Z",
    expireAt: "2026-10-30 16:00:00",
  }
  api.list.mockResolvedValue({ data: { records: [message] }, error: null })
  api.summary.mockResolvedValue({ data: { messageId: message.id, message, byStatus: { dead: 1 } }, error: null })
  api.rows.mockResolvedValue({ data: { records: [], total: 0 }, error: null })
  api.retry.mockResolvedValue({ data: { retried: 1 }, error: null })
  let confirm!: () => Promise<unknown>
  window.$dialog = {
    warning: vi.fn((options) => {
      confirm = options.onPositiveClick
      return {}
    }),
  } as any
  host = document.createElement("div")
  document.body.append(host)
  app = createApp({ render: () => h(Deliveries) })
  app.mount(host)
  await settle()
  const retry = [...host.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
    button.textContent?.includes("retryFailedCount"),
  )!
  expect(retry.disabled).toBe(false)
  retry.click()
  expect(confirm).toBeTypeOf("function")
  // Cross the boundary without a reactive timer tick: confirmation still rejects.
  vi.setSystemTime(new Date("2026-10-30T08:00:00Z"))
  expect(await confirm()).toBe(false)
  expect(api.retry).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1000)
  await settle()
  expect(retry.disabled).toBe(true)
})
