// @vitest-environment jsdom
import { createApp, h, KeepAlive, nextTick, reactive, ref } from "vue"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { NConfigProvider } from "naive-ui"
import AnnouncementList from "@/views/notification/manage/announcements/index.vue"

const api = vi.hoisted(() => ({ check: vi.fn(), list: vi.fn(), refresh: vi.fn() }))
const banner = reactive({ snapshot: null as { revision: number } | null })
vi.mock("@/service/api", () => ({
  fetchCheckBanner: api.check,
  fetchGetAnnouncements: api.list,
  fetchDeleteAnnouncement: vi.fn(),
  fetchCancelAnnouncement: vi.fn(),
  fetchRecallAnnouncement: vi.fn(),
}))
vi.mock("@/store/modules/banner", () => ({
  useBannerStore: () => ({
    get snapshot() {
      return banner.snapshot
    },
    refresh: api.refresh,
  }),
}))
vi.mock("@/store/modules/app", () => ({ useAppStore: () => ({ locale: "zh-CN", isMobile: false }) }))
vi.mock("@/hooks/business/auth", () => ({
  useAuth: () => ({
    hasAuth: () => true,
    getActionContext: () => ({
      ready: true,
      hasAuth: () => true,
      actorId: "actor",
      isAdmin: true,
      impersonating: false,
      locale: "zh-CN",
    }),
  }),
}))
vi.mock("@/locales", () => ({ $t: (key: string) => key, getLocale: () => "zh-CN" }))
vi.mock("@/views/notification/manage/announcements/modules/announcement-operate-drawer.vue", () => ({
  default: { render: () => null },
}))
vi.mock("@/views/notification/manage/announcements/modules/announcement-detail.vue", () => ({
  default: { render: () => null },
}))
vi.mock("@/components/advanced/table-header-operation.vue", () => ({
  default: {
    setup:
      (_: unknown, { emit }: any) =>
      () =>
        h("button", { class: "refresh-all", onClick: () => emit("refresh") }, "refresh"),
  },
}))

const response = (revision = 1) => ({
  data: { revision, current: null, scheduled: null, serverNow: new Date().toISOString() },
  error: null,
})
const flush = async () => {
  for (let i = 0; i < 12; i++) await nextTick()
}
const originalScrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollTo")
let app: ReturnType<typeof createApp>
let host: HTMLElement
let shown: ReturnType<typeof ref<boolean>>
function visibility(value: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, value })
  document.dispatchEvent(new Event("visibilitychange"))
}
async function mount() {
  host = document.createElement("div")
  document.body.append(host)
  shown = ref(true)
  app = createApp({
    render: () =>
      h(NConfigProvider, null, {
        default: () => h(KeepAlive, null, { default: () => (shown.value ? h(AnnouncementList) : null) }),
      }),
  })
  app.component("SvgIcon", { render: () => h("span") })
  app.mount(host)
  await flush()
}
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: vi.fn() })
  vi.useFakeTimers()
  vi.resetAllMocks()
  banner.snapshot = null
  visibility("visible")
  api.check.mockResolvedValue(response())
  api.list.mockResolvedValue({ data: { records: [], page: 1, pageSize: 20, total: 0 }, error: null })
  api.refresh.mockResolvedValue(undefined)
})
afterEach(() => {
  app?.unmount()
  host?.remove()
  vi.useRealTimers()
  visibility("visible")
  if (originalScrollTo) Object.defineProperty(HTMLElement.prototype, "scrollTo", originalScrollTo)
  else Reflect.deleteProperty(HTMLElement.prototype, "scrollTo")
})

it("limits focus checks to once per 30 seconds while manual refresh remains immediate", async () => {
  await mount()
  for (let i = 0; i < 10; i++) window.dispatchEvent(new Event("focus"))
  await flush()
  expect(api.check).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(30000)
  window.dispatchEvent(new Event("focus"))
  window.dispatchEvent(new Event("focus"))
  await flush()
  expect(api.check).toHaveBeenCalledTimes(2)
  host.querySelector<HTMLButtonElement>('[aria-busy="false"]')!.click()
  await flush()
  expect(api.check).toHaveBeenCalledTimes(3)
})

it("shares overlapping requests and follows up once when the response predates a new revision", async () => {
  let finish!: (value: unknown) => void
  api.check.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  await mount()
  banner.snapshot = { revision: 2 }
  window.dispatchEvent(new Event("focus"))
  await flush()
  expect(api.check).toHaveBeenCalledTimes(1)
  api.check.mockResolvedValue(response(2))
  finish(response(1))
  await flush()
  expect(api.check).toHaveBeenCalledTimes(2)
})

it("does not refetch when an in-flight response already includes the announced revision", async () => {
  let finish!: (value: unknown) => void
  api.check.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  await mount()
  banner.snapshot = { revision: 2 }
  await flush()
  finish(response(2))
  await flush()
  expect(api.check).toHaveBeenCalledTimes(1)
})

it("checks once after refresh-all synchronizes the global banner revision", async () => {
  await mount()
  api.refresh.mockImplementation(async () => {
    banner.snapshot = { revision: 2 }
  })
  api.check.mockResolvedValue(response(2))
  host.querySelector<HTMLButtonElement>(".refresh-all")!.click()
  await flush()
  expect(api.check).toHaveBeenCalledTimes(2)
})

it("reuses a pending check when refresh-all confirms that its response already covers the new revision", async () => {
  let finish!: (value: unknown) => void
  api.check.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  await mount()
  api.refresh.mockImplementation(async () => {
    banner.snapshot = { revision: 2 }
  })
  api.check.mockResolvedValue(response(2))
  host.querySelector<HTMLButtonElement>(".refresh-all")!.click()
  host.querySelector<HTMLButtonElement>(".refresh-all")!.click()
  await flush()
  expect(api.list).toHaveBeenCalledTimes(3)
  finish(response(2))
  await flush()
  expect(api.check).toHaveBeenCalledTimes(1)
})

it("does not loop on a stale response and allows an immediate manual retry", async () => {
  await mount()
  banner.snapshot = { revision: 2 }
  await flush()
  expect(host.textContent).toContain("page.notification.banner.summaryFailed")
  await vi.advanceTimersByTimeAsync(60000)
  expect(api.check).toHaveBeenCalledTimes(2)
  api.check.mockResolvedValue(response(2))
  host.querySelector<HTMLButtonElement>('[aria-busy="false"]')!.click()
  await flush()
  expect(api.check).toHaveBeenCalledTimes(3)
  expect(host.textContent).not.toContain("page.notification.banner.summaryFailed")
})

it("defers hidden-page focus and revision checks until visible", async () => {
  await mount()
  visibility("hidden")
  await flush()
  banner.snapshot = { revision: 2 }
  window.dispatchEvent(new Event("focus"))
  await vi.advanceTimersByTimeAsync(60000)
  expect(api.check).toHaveBeenCalledTimes(1)
  api.check.mockResolvedValue(response(2))
  visibility("visible")
  window.dispatchEvent(new Event("focus"))
  await flush()
  expect(api.check).toHaveBeenCalledTimes(2)
})

it("suspends cached pages and checks once after reactivation", async () => {
  await mount()
  shown.value = false
  await flush()
  banner.snapshot = { revision: 2 }
  window.dispatchEvent(new Event("focus"))
  await flush()
  expect(api.check).toHaveBeenCalledTimes(1)
  api.check.mockResolvedValue(response(2))
  shown.value = true
  await flush()
  expect(api.check).toHaveBeenCalledTimes(2)
})
