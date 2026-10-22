// @vitest-environment jsdom
import { createApp, h, nextTick } from "vue"
import { createMemoryHistory, createRouter } from "vue-router"
import { afterEach, expect, it, vi } from "vitest"
import AuditLogPage from "@/views/manage/audit-log/index.vue"
import { fetchGetAuditLogList } from "@/service/api"

vi.mock("@/locales", () => ({ $t: (key: string) => key }))
vi.mock("@/store/modules/app", () => ({ useAppStore: () => ({ locale: "zh-CN", isMobile: false }) }))
vi.mock("@/service/api", () => ({
  fetchGetAuditLogList: vi
    .fn()
    .mockResolvedValue({ data: { records: [], total: 0, page: 1, pageSize: 20 }, error: null }),
  fetchGetAuditLogCatalog: vi.fn().mockResolvedValue({ data: { timezone: "Asia/Shanghai", actions: [] }, error: null }),
  fetchGetAuditLogActors: vi.fn().mockResolvedValue({ data: [], error: null }),
  fetchGetAuditLogDetail: vi.fn().mockResolvedValue({ data: null, error: null }),
  fetchGetAuditLogTargets: vi.fn().mockResolvedValue({ data: null, error: null }),
}))
const cleanups: Array<() => void> = []
afterEach(() => {
  cleanups.splice(0).forEach((fn) => fn())
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(HTMLElement.prototype, "scrollTo")
})
async function settle() {
  await nextTick()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await nextTick()
}

it("keeps draft keywords out of refresh requests until search applies them", async () => {
  HTMLElement.prototype.scrollTo = vi.fn()
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/", component: AuditLogPage }] })
  await router.push({ path: "/", query: { timeRange: "all", keyword: "Original" } })
  await router.isReady()
  const host = document.createElement("div")
  document.body.append(host)
  const app = createApp({ render: () => h(AuditLogPage) })
  app.use(router)
  app.mount(host)
  cleanups.push(() => {
    app.unmount()
    host.remove()
  })
  await settle()
  const input = host.querySelector('input[aria-label="page.manage.auditLog.keyword"]') as HTMLInputElement
  input.value = "Draft"
  input.dispatchEvent(new Event("input", { bubbles: true }))
  await settle()
  expect(host.textContent).toContain("page.manage.auditLog.filtersPending")
  ;([...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === "common.refresh") as HTMLElement).click()
  await settle()
  expect(fetchGetAuditLogList).toHaveBeenLastCalledWith({ page: 1, pageSize: 20, keyword: "Original" })
  ;([...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === "common.search") as HTMLElement).click()
  await settle()
  expect(fetchGetAuditLogList).toHaveBeenLastCalledWith({ page: 1, pageSize: 20, keyword: "Draft" })
  expect(router.currentRoute.value.query.keyword).toBe("Draft")
  expect(host.textContent).not.toContain("page.manage.auditLog.filtersPending")
})
