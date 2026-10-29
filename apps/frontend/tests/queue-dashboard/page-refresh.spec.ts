// @vitest-environment jsdom
import { createApp, h, KeepAlive, nextTick, ref } from "vue"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import QueueDashboard from "@/views/queue/dashboard/index.vue"

const api = vi.hoisted(() => ({
  workers: vi.fn(),
  groups: vi.fn(),
  overview: vi.fn(),
  names: vi.fn(),
  ranking: vi.fn(),
}))
const socket = vi.hoisted(() => ({ listeners: new Map<string, (data: any) => void>(), connected: null as any }))
vi.mock("@/service/api", () => ({
  fetchGetAllWorkers: api.workers,
  fetchWorkerGroups: api.groups,
  fetchQueueDashboard: api.overview,
  fetchTaskStatsByName: api.names,
  fetchTaskStatsByWorker: api.ranking,
  fetchWorkerHistory: vi.fn(),
  fetchRetireWorker: vi.fn(),
  fetchShutdownWorker: vi.fn(),
}))
vi.mock("@/hooks/common/app-socket", () => ({
  useAppSocket: () => ({
    connect: vi.fn(),
    isConnected: socket.connected,
    on: (name: string, listener: (data: any) => void) => socket.listeners.set(name, listener),
  }),
}))
vi.mock("@/locales", () => ({ $t: (key: string) => key }))
vi.mock("vue-router", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("@/views/queue/dashboard/modules/worker-cards.vue", () => ({ default: { render: () => null } }))
vi.mock("@/views/queue/dashboard/modules/worker-drawer.vue", () => ({ default: { render: () => null } }))
vi.mock("@/views/queue/dashboard/modules/overview-chart.vue", () => ({ default: { render: () => null } }))
vi.mock("naive-ui", () => {
  const slot = {
    setup:
      (_: any, { slots }: any) =>
      () =>
        h("div", slots.default?.()),
  }
  return Object.fromEntries(
    [
      "NCard",
      "NTag",
      "NButton",
      "NAlert",
      "NSpin",
      "NGrid",
      "NGridItem",
      "NTable",
      "NRadioGroup",
      "NRadioButton",
      "NEmpty",
      "NPagination",
    ].map((name) => [name, slot]),
  )
})
const flush = async () => {
  for (let i = 0; i < 10; i++) await nextTick()
}
let app: ReturnType<typeof createApp>
let host: HTMLElement
let visible: ReturnType<typeof ref<boolean>>
function visibility(state: "hidden" | "visible") {
  Object.defineProperty(document, "visibilityState", { configurable: true, value: state })
  document.dispatchEvent(new Event("visibilitychange"))
}
beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  visibility("visible")
  socket.connected = ref(false)
  socket.listeners.clear()
  api.workers.mockResolvedValue({
    data: [{ id: "worker", hostname: "celery@current", status: "1", lifecycle: "active" }],
    error: null,
  })
  api.groups.mockResolvedValue({ data: [], error: null })
  api.overview.mockResolvedValue({
    data: {
      sampledAt: new Date().toISOString(),
      queues: [],
      queueDepth: 0,
      onlineWorkers: 1,
      totalWorkers: 1,
      capacityKnown: true,
      activeTasks: 0,
      concurrency: 1,
      success: 0,
      failure: 0,
      retry: 0,
      revoked: 0,
      throughput: 0,
      successRate: null,
      avgRuntime: null,
      p95Runtime: null,
      timeline: [],
      depthTimeline: [],
    },
    error: null,
  })
  api.names.mockResolvedValue({ data: { records: [] }, error: null })
  api.ranking.mockResolvedValue({ data: [], error: null })
  visible = ref(true)
  host = document.createElement("div")
  document.body.append(host)
  app = createApp({ render: () => h(KeepAlive, null, { default: () => (visible.value ? h(QueueDashboard) : null) }) })
  app.component("SvgIcon", { render: () => h("span") })
  app.mount(host)
})
afterEach(() => {
  app.unmount()
  host.remove()
  vi.useRealTimers()
  visibility("visible")
})

it("uses one 30-second polling source and does not refetch on initial socket connection or heartbeats", async () => {
  await flush()
  socket.connected.value = true
  await flush()
  socket.listeners.get("worker:status")!({
    hostname: "celery@current",
    status: "1",
    lifecycle: "active",
    activeTaskCount: 1,
  })
  await vi.advanceTimersByTimeAsync(2000)
  for (const fetch of Object.values(api)) expect(fetch).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(58000)
  for (const fetch of Object.values(api)) expect(fetch).toHaveBeenCalledTimes(3)
})

it("pauses HTTP while the document is hidden and calibrates once on return", async () => {
  await flush()
  visibility("hidden")
  await flush()
  socket.listeners.get("worker:status")!({ hostname: "new", status: "1", lifecycle: "active" })
  socket.listeners.get("task:update")!({ taskId: "task", status: "3" })
  await vi.advanceTimersByTimeAsync(90000)
  for (const fetch of Object.values(api)) expect(fetch).toHaveBeenCalledTimes(1)
  visibility("visible")
  await flush()
  for (const fetch of Object.values(api)) expect(fetch).toHaveBeenCalledTimes(2)
})

it("coalesces structural changes behind a slow inventory request without losing the final refresh", async () => {
  await flush()
  let finish!: (value: unknown) => void
  api.workers.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  await vi.advanceTimersByTimeAsync(30000)
  for (let i = 0; i < 10; i++)
    socket.listeners.get("worker:status")!({ hostname: `new-${i}`, status: "1", lifecycle: "active" })
  await vi.advanceTimersByTimeAsync(250)
  expect(api.workers).toHaveBeenCalledTimes(2)
  finish({ data: [], error: null })
  await flush()
  expect(api.workers).toHaveBeenCalledTimes(3)
  expect(api.groups).toHaveBeenCalledTimes(3)
})

it("pauses cached routes when deactivated and refreshes once on reactivation", async () => {
  await flush()
  visible.value = false
  await flush()
  await vi.advanceTimersByTimeAsync(90000)
  for (const fetch of Object.values(api)) expect(fetch).toHaveBeenCalledTimes(1)
  visible.value = true
  await flush()
  for (const fetch of Object.values(api)) expect(fetch).toHaveBeenCalledTimes(2)
})
