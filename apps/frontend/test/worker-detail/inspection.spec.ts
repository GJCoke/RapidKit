// @vitest-environment jsdom
import { effectScope, nextTick, ref } from "vue"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { useWorkerInspection } from "../../src/views/queue/dashboard/composables/use-worker-inspection"
const api = vi.hoisted(() => ({ active: vi.fn(), reserved: vi.fn() }))
vi.mock("@/service/api/worker", () => ({
  fetchActiveTasksOfWorker: api.active,
  fetchReservedTasksOfWorker: api.reserved,
}))
let scope: ReturnType<typeof effectScope>
const flush = async () => {
  for (let i = 0; i < 8; i++) await nextTick()
}
beforeEach(() => {
  vi.useFakeTimers()
  api.active.mockReset().mockResolvedValue({ data: [], error: null })
  api.reserved.mockReset().mockResolvedValue({ data: [], error: null })
  scope = effectScope()
})
afterEach(() => {
  scope.stop()
  vi.useRealTimers()
})
function setup() {
  const worker = ref({ id: "one", activeTaskCount: 0 })
  const visible = ref(true)
  const tab = ref("overview")
  const online = ref(true)
  const state = scope.run(() =>
    useWorkerInspection(
      () => worker.value,
      () => visible.value && tab.value === "tasks",
      () => online.value,
    ),
  )!
  return { worker, visible, tab, online, state }
}
it("only inspects visible task pane and stops polling when hidden", async () => {
  const { tab, visible, state } = setup()
  await flush()
  expect(api.active).not.toHaveBeenCalled()
  tab.value = "tasks"
  await flush()
  expect(state.active.sampledAt).not.toBeNull()
  expect(api.active).toHaveBeenCalledWith("one")
  await vi.advanceTimersByTimeAsync(15000)
  expect(api.active).toHaveBeenCalledTimes(2)
  visible.value = false
  await flush()
  await vi.advanceTimersByTimeAsync(30000)
  expect(api.active).toHaveBeenCalledTimes(2)
})
it("ignores late responses from the previous Worker", async () => {
  let resolveOld: (value: any) => void = () => {}
  api.active.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveOld = resolve
      }),
  )
  const { worker, tab, state } = setup()
  tab.value = "tasks"
  await flush()
  worker.value = { id: "two", activeTaskCount: 0 }
  api.active.mockResolvedValue({ data: [{ id: "new", name: "new-task" }], error: null })
  await flush()
  resolveOld({ data: [{ id: "old", name: "old-task" }], error: null })
  await flush()
  expect(state.active.rows.map((row) => row.id)).toEqual(["new"])
})
it("preserves row identity on refresh and keeps snapshots on failure", async () => {
  api.active.mockResolvedValue({ data: [{ id: "same", name: "task", workerPid: 1 }], error: null })
  const { tab, state } = setup()
  tab.value = "tasks"
  await flush()
  const row = state.active.rows[0]
  api.active.mockResolvedValue({ data: [{ id: "same", name: "task", workerPid: 2 }], error: null })
  await state.refresh()
  expect(state.active.rows[0]).toBe(row)
  expect(row.workerPid).toBe(2)
  api.active.mockRejectedValue(new Error("network"))
  await state.refresh()
  expect(state.active.failed).toBe(true)
  expect(state.active.rows[0]).toBe(row)
})
it("clears the previous inspection when offline and makes no calls", async () => {
  const { online, tab, state } = setup()
  tab.value = "tasks"
  await flush()
  online.value = false
  await flush()
  await vi.advanceTimersByTimeAsync(15000)
  expect(api.active).toHaveBeenCalledTimes(1)
  expect(state.active.sampledAt).toBeNull()
})
it("keeps task rows and sample timestamp when the same Worker receives a heartbeat", async () => {
  api.active.mockResolvedValue({ data: [{ id: "running", name: "task" }], error: null })
  const { worker, tab, state } = setup()
  tab.value = "tasks"
  await flush()
  const row = state.active.rows[0]
  const sampledAt = state.active.sampledAt
  worker.value = { ...worker.value, activeTaskCount: 1 }
  await flush()
  expect(state.active.rows[0]).toBe(row)
  expect(state.active.sampledAt).toBe(sampledAt)
  expect(api.active).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(750)
  expect(state.active.rows[0]).toBe(row)
})
