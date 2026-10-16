import { onScopeDispose, reactive, watch } from "vue"
import { fetchActiveTasksOfWorker, fetchReservedTasksOfWorker } from "@/service/api/worker"
import { reconcileRows } from "./reconcile"

export function useWorkerInspection(
  worker: () => { id: string } | null,
  enabled: () => boolean,
  online: () => boolean,
) {
  const createState = () => ({
    rows: [] as Api.Worker.ActiveTaskInfo[],
    loading: false,
    failed: false,
    sampledAt: null as number | null,
  })
  const active = reactive(createState())
  const reserved = reactive(createState())
  let session = 0
  let disposed = false
  let inspected = false

  async function refresh() {
    const id = worker()?.id
    if (disposed || !id || !enabled() || !online() || active.loading || reserved.loading) return
    const generation = session
    inspected = true
    active.loading = reserved.loading = true
    const replies = await Promise.allSettled([fetchActiveTasksOfWorker(id), fetchReservedTasksOfWorker(id)])
    if (disposed || generation !== session) return
    for (const [index, state] of [active, reserved].entries()) {
      const reply = replies[index]
      if (reply.status === "fulfilled" && !reply.value.error && Array.isArray(reply.value.data)) {
        reconcileRows(state.rows, reply.value.data, (row) => row.id)
        state.sampledAt = Date.now()
        state.failed = false
      } else state.failed = true
      state.loading = false
    }
  }
  watch(
    [() => worker()?.id, online],
    ([id], [previousId]) => {
      session++
      if (id !== previousId) inspected = false
      for (const state of [active, reserved]) {
        state.rows.splice(0)
        state.sampledAt = null
        state.failed = false
        state.loading = false
      }
    },
    { immediate: true },
  )
  watch(
    [() => worker()?.id, enabled, online],
    () => {
      if (!inspected) void refresh()
    },
    { immediate: true },
  )
  onScopeDispose(() => {
    disposed = true
    session++
  })
  return { active, reserved, refresh }
}
