// @vitest-environment jsdom
import { createApp, h, nextTick, reactive } from "vue"
import { expect, it, vi } from "vitest"
import TaskStream from "../../src/views/queue/task/modules/task-stream.vue"
const api = vi.hoisted(() => ({ fetch: vi.fn(), table: null as any }))
vi.mock("@/service/api", () => ({ fetchGetTaskList: api.fetch, fetchRevokeTask: vi.fn() }))
vi.mock("@/locales", () => ({ $t: (key: string) => key }))
vi.mock("@/store/modules/app", () => ({ useAppStore: () => ({ isMobile: false }) }))
vi.mock("@/hooks/business/auth", () => ({ useAuth: () => ({ hasAuth: () => false }) }))
vi.mock("naive-ui", () => ({
  NButton: {
    setup:
      (_: any, { slots }: any) =>
      () =>
        h("button", slots.default?.()),
  },
  NPopconfirm: {},
  NTag: {},
  NSpace: {
    setup:
      (_: any, { slots }: any) =>
      () =>
        slots.default?.(),
  },
  NCard: {
    setup:
      (_: any, { slots }: any) =>
      () =>
        slots.default?.(),
  },
  NDataTable: {
    props: ["columns", "data", "pagination"],
    setup: (props: any) => {
      api.table = props
      return () => h("div")
    },
  },
}))
const flush = async () => {
  await nextTick()
  await nextTick()
  await nextTick()
}
it("keeps record page on rolling interval refresh and resets for a changed status filter", async () => {
  api.fetch.mockResolvedValue({ data: { records: [], total: 50 }, error: null })
  const state = reactive({
    filters: { startTime: "2026-10-01T00:00:00Z", endTime: "2026-10-08T00:00:00Z" },
    resetKey: "all",
  })
  const app = createApp({ render: () => h(TaskStream, state) })
  const host = document.createElement("div")
  app.mount(host)
  await flush()
  api.table.pagination.onUpdatePage(2)
  await flush()
  state.filters.endTime = "2026-10-08T00:01:00Z"
  await flush()
  expect(api.fetch).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2, endTime: state.filters.endTime }))
  state.resetKey = "failure"
  Object.assign(state.filters, { status: "4" })
  await flush()
  expect(api.fetch).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, status: "4" }))
  api.table.pagination.onUpdatePage(2)
  await flush()
  const calls = api.fetch.mock.calls.length
  state.resetKey = "failure-search-again"
  await flush()
  expect(api.fetch).toHaveBeenCalledTimes(calls + 1)
  expect(api.fetch).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, status: "4" }))
  app.unmount()
})
