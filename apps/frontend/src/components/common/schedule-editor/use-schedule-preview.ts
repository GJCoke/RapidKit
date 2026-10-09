import { onScopeDispose, ref, watch } from "vue"
import type { Ref } from "vue"
import type { PreviewLoader, SchedulePreview } from "./schedule"

export function useSchedulePreview<T extends object>(
  model: Ref<T>,
  loader: () => PreviewLoader<T>,
  valid: () => boolean,
  debounceMs = 300,
) {
  const preview = ref<SchedulePreview | null>(null)
  const previewFailed = ref(false)
  const loading = ref(false)
  let generation = 0
  let disposed = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let active: { generation: number; promise: Promise<boolean> } | null = null
  function invalidate() {
    generation++
    clearTimeout(timer)
    preview.value = null
    previewFailed.value = false
    loading.value = false
    if (valid())
      timer = setTimeout(() => {
        void refresh()
      }, debounceMs)
  }
  async function refresh(): Promise<boolean> {
    clearTimeout(timer)
    if (disposed || !valid()) return false
    if (active?.generation === generation) return active.promise
    const current = generation
    const snapshot = { ...model.value }
    loading.value = true
    previewFailed.value = false
    const promise = (async () => {
      try {
        const result = await Promise.resolve().then(() => loader()(snapshot))
        if (disposed || current !== generation) return false
        preview.value = result
        previewFailed.value = !result
        return Boolean(result?.valid)
      } catch {
        if (!disposed && current === generation) previewFailed.value = true
        return false
      } finally {
        if (!disposed && current === generation) loading.value = false
        if (active?.generation === current) active = null
      }
    })()
    active = { generation: current, promise }
    return promise
  }
  async function validate() {
    const current = generation
    return (await refresh()) && current === generation && !disposed && valid()
  }
  watch([model, valid], invalidate, { deep: true, flush: "sync" })
  watch(loader, invalidate)
  invalidate()
  onScopeDispose(() => {
    disposed = true
    generation++
    clearTimeout(timer)
  })
  return { preview, previewFailed, loading, refresh, validate }
}
