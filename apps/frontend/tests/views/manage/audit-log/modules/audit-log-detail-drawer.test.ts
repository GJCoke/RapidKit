// @vitest-environment jsdom
import { createApp, h, nextTick, ref } from "vue"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import AuditLogDetailDrawer from "@/views/manage/audit-log/modules/audit-log-detail-drawer.vue"
import AuditLogRelatedRecords from "@/views/manage/audit-log/modules/audit-log-related-records.vue"
import { fetchGetAuditLogDetail, fetchGetAuditLogList } from "@/service/api"

vi.mock("@/service/api", () => ({
  fetchGetAuditLogDetail: vi.fn(),
  fetchGetAuditLogList: vi.fn(),
  fetchGetAuditLogTargets: vi.fn().mockResolvedValue({ data: { records: [], total: 0 }, error: null }),
}))
vi.mock("@/locales", () => ({ $t: (key: string) => key }))
vi.mock("@/store/modules/app", () => ({ useAppStore: () => ({ locale: "zh-CN", isMobile: false }) }))

const cleanups: Array<() => void> = []
const audit = (id: string) => ({
  id,
  action: "department.create",
  actorType: "user",
  actorId: null,
  actorName: "Admin",
  actorUsername: "admin",
  subjectUserId: null,
  subjectName: null,
  subjectUsername: null,
  impersonationSessionId: null,
  resourceType: "department",
  resourceId: "department-1",
  resourceName: "Engineering",
  targetCount: null,
  result: "success",
  riskLevel: "normal",
  source: "http",
  occurredAt: "2026-10-21T10:00:00Z",
  requestId: "request-1",
  correlationId: null,
  durationMs: 10,
  ip: null,
  httpMethod: "POST",
  path: "/departments",
  userAgent: null,
  requestSummary: null,
  responseCode: 200,
  httpStatus: 200,
  businessCode: 0,
  errorKey: null,
  errorMessage: null,
  metadata: {},
  changes: [],
})
async function settle() {
  await nextTick()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await nextTick()
}
beforeEach(() => {
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
  vi.mocked(fetchGetAuditLogDetail).mockImplementation(async (id) => ({ data: audit(id), error: null }) as any)
  vi.mocked(fetchGetAuditLogList).mockResolvedValue({
    data: { records: [audit("related-event")], total: 1, page: 1, pageSize: 10 },
    error: null,
  } as any)
})
afterEach(() => {
  cleanups.splice(0).forEach((fn) => fn())
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(HTMLElement.prototype, "scrollTo")
})

it("investigates related records in place and returns to the original event without replacing list filters", async () => {
  const filters = ref({ keyword: "Engineering", page: 3 })
  const visible = ref(true)
  const host = document.createElement("div")
  document.body.append(host)
  const app = createApp({
    render: () =>
      h(AuditLogDetailDrawer, {
        visible: visible.value,
        "onUpdate:visible": (value: boolean) => {
          visible.value = value
        },
        auditId: "original-event",
        catalog: { timezone: "Asia/Shanghai", actions: [] },
        onRelated: (value: typeof filters.value) => {
          filters.value = value
        },
      } as any),
  })
  app.mount(host)
  cleanups.push(() => {
    app.unmount()
    host.remove()
  })
  await settle()
  const click = async (text: string) => {
    const button = [...document.body.querySelectorAll("button")].find((b) => b.textContent?.trim() === text)
    expect(button).toBeTruthy()
    button!.click()
    await settle()
  }
  await click("page.manage.auditLog.sameRequest")
  expect(visible.value).toBe(true)
  expect(filters.value).toEqual({ keyword: "Engineering", page: 3 })
  expect(fetchGetAuditLogList).toHaveBeenCalledWith({ requestId: "request-1", page: 1, pageSize: 10 })
  expect(document.body.textContent).toContain("page.manage.auditLog.relatedAllTime")
  await click("page.manage.auditLog.openEvent")
  expect(fetchGetAuditLogDetail).toHaveBeenLastCalledWith("related-event")
  await click("page.manage.auditLog.backToEvent")
  expect(fetchGetAuditLogDetail).toHaveBeenLastCalledWith("original-event")
  expect(filters.value.page).toBe(3)
})

it("retries a failed related query and paginates it independently", async () => {
  vi.mocked(fetchGetAuditLogList).mockResolvedValueOnce({ data: null, error: new Error("unavailable") } as any)
  vi.mocked(fetchGetAuditLogList).mockResolvedValue({
    data: { records: [audit("related-event")], total: 21, page: 1, pageSize: 10 },
    error: null,
  } as any)
  const host = document.createElement("div")
  document.body.append(host)
  const app = createApp({
    render: () => h(AuditLogRelatedRecords, { filters: { resourceId: "department-1" }, catalog: null }),
  })
  app.mount(host)
  cleanups.push(() => {
    app.unmount()
    host.remove()
  })
  await settle()
  expect(host.textContent).toContain("page.manage.auditLog.loadFailed")
  expect(host.textContent).not.toContain("page.manage.auditLog.noRelated")
  ;([...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === "common.refresh") as HTMLElement).click()
  await settle()
  expect(host.textContent).toContain("Engineering")
  ;([...host.querySelectorAll(".n-pagination-item")].find((b) => b.textContent?.trim() === "2") as HTMLElement).click()
  await settle()
  expect(fetchGetAuditLogList).toHaveBeenLastCalledWith({ resourceId: "department-1", page: 2, pageSize: 10 })
})
