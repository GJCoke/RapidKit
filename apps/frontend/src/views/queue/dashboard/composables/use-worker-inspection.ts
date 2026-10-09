import { onScopeDispose, reactive, watch } from "vue"
import { fetchActiveTasksOfWorker, fetchReservedTasksOfWorker } from "@/service/api/worker"
import { reconcileRows } from "./reconcile"

export function useWorkerInspection(
  worker: () => { id: string; activeTaskCount: number } | null,
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
  let debounce: ReturnType<typeof setTimeout> | undefined

  async function refresh() {
    const id = worker()?.id
    if (disposed || !id || !enabled() || !online() || active.loading || reserved.loading) return
    const generation = session
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
    [() => worker()?.id, enabled, online],
    () => {
      session++
      clearTimeout(debounce)
      for (const state of [active, reserved]) {
        state.rows.splice(0)
        state.sampledAt = null
        state.failed = false
        state.loading = false
      }
      void refresh()
    },
    { immediate: true },
  )
  watch(
    () => worker()?.activeTaskCount,
    () => {
      clearTimeout(debounce)
      debounce = setTimeout(() => void refresh(), 750)
    },
  )
  const poll = setInterval(() => void refresh(), 15000)
  onScopeDispose(() => {
    disposed = true
    session++
    clearInterval(poll)
    clearTimeout(debounce)
  })
  return { active, reserved, refresh }
}
