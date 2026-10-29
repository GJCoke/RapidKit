// @vitest-environment jsdom
import { createApp, h, nextTick } from "vue"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import StatsPanel from "../../src/views/queue/dashboard/modules/stats-panel.vue"

const api = vi.hoisted(() => ({
  overview: vi.fn(),
  names: vi.fn(),
  workers: vi.fn(),
  setDays: null as any,
  push: vi.fn(),
}))
vi.mock("@/service/api", () => ({
  fetchQueueDashboard: api.overview,
  fetchTaskStatsByName: api.names,
  fetchTaskStatsByWorker: api.workers,
}))
vi.mock("@/locales", () => ({ $t: (key: string) => key }))
vi.mock("vue-router", () => ({ useRouter: () => ({ push: api.push }) }))
vi.mock("../../src/views/queue/dashboard/modules/overview-chart.vue", () => ({
  default: {
    props: ["kind"],
    setup:
      (p: any, { emit }: any) =>
      () =>
        h("button", {
          class: `ranking-${p.kind}`,
          onClick: () => emit("select", p.kind === "tasks" ? "plugin.tasks.exact" : "celery@current"),
        }),
  },
}))
vi.mock("naive-ui", () => {
  const slot = {
    setup:
      (_: any, { slots }: any) =>
      () =>
        h("div", slots.default?.()),
  }
  return {
    NCard: slot,
    NTag: slot,
    NButton: slot,
    NAlert: slot,
    NSpin: slot,
    NGrid: slot,
    NGridItem: slot,
    NTable: slot,
    NRadioButton: slot,
    NEmpty: { props: ["description"], setup: (p: any) => () => h("div", p.description) },
    NRadioGroup: {
      setup: (_: any, { attrs, slots }: any) => {
        api.setDays = attrs["onUpdate:value"]
        return () => h("div", slots.default?.())
      },
    },
  }
})
const sample = (success = 9) => ({
  sampledAt: new Date().toISOString(),
  queues: [{ name: "celery", depth: 0, consumers: 1 }],
  queueDepth: 0,
  onlineWorkers: 1,
  totalWorkers: 1,
  activeTasks: 0,
  concurrency: 8,
  throughput: 1,
  success,
  failure: 1,
  retry: 0,
  revoked: 0,
  successRate: 90,
  avgRuntime: 1,
  p95Runtime: 2,
  timeline: [],
  depthTimeline: [],
})
const flush = async () => {
  for (let i = 0; i < 8; i++) await nextTick()
}
let app: ReturnType<typeof createApp>
let host: HTMLElement
function mount() {
  host = document.createElement("div")
  document.body.append(host)
  app = createApp(StatsPanel, { connected: false })
  app.component("SvgIcon", { render: () => h("span") })
  return app.mount(host) as any
}
beforeEach(() => {
  vi.useFakeTimers()
  api.overview.mockReset().mockResolvedValue({ data: sample(), error: null })
  api.names.mockReset().mockResolvedValue({ data: { records: [] }, error: null })
  api.workers.mockReset().mockResolvedValue({ data: [], error: null })
})
afterEach(() => {
  app?.unmount()
  host?.remove()
  vi.useRealTimers()
})

describe("authoritative overview refresh", () => {
  it("bounds sustained task events to one statistics refresh per 30 seconds", async () => {
    const panel = mount()
    await flush()
    for (let second = 0; second < 29; second++) {
      panel.handleTaskUpdate({ taskId: `task-${second}`, status: "3" })
      await vi.advanceTimersByTimeAsync(1000)
    }
    expect(api.overview).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(api.overview).toHaveBeenCalledTimes(2)
    expect(api.names).toHaveBeenCalledTimes(2)
    expect(api.workers).toHaveBeenCalledTimes(2)
  })
  it("coalesces duplicate task events instead of incrementing counts", async () => {
    const panel = mount()
    await flush()
    for (let i = 0; i < 10; i++) panel.handleTaskUpdate({ taskId: "same", status: "3" })
    await vi.advanceTimersByTimeAsync(30000)
    await flush()
    expect(api.overview).toHaveBeenCalledTimes(2)
    expect(host.textContent).toContain("9")
    app.unmount()
    await vi.advanceTimersByTimeAsync(60000)
    expect(api.overview).toHaveBeenCalledTimes(2)
  })
  it("preserves queue rows and scroll position while updating their values", async () => {
    const panel = mount()
    await flush()
    const scroll = host.querySelector(".queue-table-scroll") as HTMLElement
    const row = host.querySelector("tbody tr")
    scroll.scrollTop = 32
    api.overview.mockResolvedValue({
      data: { ...sample(), queues: [{ name: "celery", depth: 7, consumers: 1 }], queueDepth: 7 },
      error: null,
    })
    panel.handleTaskUpdate({ taskId: "new", status: "3" })
    await vi.advanceTimersByTimeAsync(30000)
    await flush()
    expect(host.querySelector(".queue-table-scroll")).toBe(scroll)
    expect(host.querySelector("tbody tr")).toBe(row)
    expect(scroll.scrollTop).toBe(32)
    expect(row?.textContent).toContain("7")
  })
  it("rejects stale responses after changing the selected window", async () => {
    let resolveOld: (value: any) => void = () => {}
    api.overview.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve
        }),
    )
    mount()
    api.setDays(7)
    await flush()
    expect(api.overview).toHaveBeenLastCalledWith({ days: 7 })
    resolveOld({ data: sample(99999), error: null })
    await flush()
    expect(host.textContent).not.toContain("99,999")
  })
  it("shows collection failure rather than zero after a failed request", async () => {
    api.overview.mockResolvedValue({ data: null, error: {} })
    mount()
    await flush()
    expect(host.textContent).toContain("page.manage.worker.overview.unavailable")
    expect(host.textContent).toContain("—")
  })
})

it("routes ranking clicks into exact task and worker record filters", async () => {
  api.names.mockResolvedValue({ data: { records: [{ taskName: "plugin.tasks.exact", total: 3 }] }, error: null })
  api.workers.mockResolvedValue({ data: [{ workerHostname: "celery@current", total: 3 }], error: null })
  mount()
  await flush()
  ;(host.querySelector(".ranking-tasks") as HTMLElement).click()
  expect(api.push).toHaveBeenLastCalledWith({
    path: "/queue/task",
    query: expect.objectContaining({
      view: "records",
      task: "plugin.tasks.exact",
      range: "custom",
      startTime: expect.any(String),
      endTime: expect.any(String),
    }),
  })
  const taskQuery = api.push.mock.calls.at(-1)![0].query
  expect(new Date(taskQuery.endTime).getTime() - new Date(taskQuery.startTime).getTime()).toBe(86400000)
  ;(host.querySelector(".ranking-workers") as HTMLElement).click()
  expect(api.push).toHaveBeenLastCalledWith({
    path: "/queue/task",
    query: expect.objectContaining({ view: "records", worker: "celery@current" }),
  })
  expect(api.push.mock.calls.at(-1)![0].query.task).toBeUndefined()
})
