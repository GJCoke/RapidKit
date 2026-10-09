import { computed, onScopeDispose, ref, toRaw, watch } from "vue"
import type { Ref } from "vue"
import { decodeCron, encodeCron, formatCron } from "./cron"
import type { CrontabPreview, CrontabValue, CronMode, PreviewLoader } from "./cron"

export function useCrontabEditor(model: Ref<CrontabValue>, loader: () => PreviewLoader, debounceMs = 300) {
  const draft = ref(decodeCron(model.value))
  const encoded = computed(() => encodeCron(draft.value))
  const localError = computed(() => encoded.value.error)
  const preview = ref<CrontabPreview | null>(null)
  const previewFailed = ref(false)
  const loading = ref(false)
  let generation = 0
  let disposed = false
  let synchronizing = false
  let emitted: CrontabValue | null = null
  let emittedExpression = ""
  let timer: ReturnType<typeof setTimeout> | undefined
  let active: { generation: number; promise: Promise<boolean> } | null = null

  async function requestPreview(): Promise<boolean> {
    clearTimeout(timer)
    const value = encoded.value.value
    if (!value || disposed) return false
    if (active?.generation === generation) return active.promise
    const current = generation
    const snapshot = { ...value }
    loading.value = true
    previewFailed.value = false
    const promise = (async () => {
      try {
        const result = await Promise.resolve().then(() => loader()(snapshot))
        if (current !== generation || disposed) return false
        preview.value = result
        previewFailed.value = !result
        return Boolean(result?.valid)
      } catch {
        if (current === generation && !disposed) previewFailed.value = true
        return false
      } finally {
        if (current === generation && !disposed) loading.value = false
        if (active?.generation === current) active = null
      }
    })()
    active = { generation: current, promise }
    return promise
  }

  function invalidate() {
    generation++
    clearTimeout(timer)
    preview.value = null
    loading.value = false
    previewFailed.value = false
    if (encoded.value.value)
      timer = setTimeout(() => {
        void requestPreview()
      }, debounceMs)
  }

  watch(
    draft,
    () => {
      if (synchronizing) return
      invalidate()
      const value = encoded.value.value
      if (value && formatCron(value) !== formatCron(model.value)) {
        emitted = value
        emittedExpression = formatCron(value)
        model.value = value
      }
    },
    { deep: true, flush: "sync" },
  )

  watch(
    model,
    (value) => {
      if (toRaw(value) === emitted && formatCron(value) === emittedExpression) return
      synchronizing = true
      draft.value = decodeCron(value)
      synchronizing = false
      invalidate()
    },
    { deep: true, flush: "sync" },
  )

  function setMode(mode: CronMode) {
    const value = encoded.value.value
    draft.value = {
      ...draft.value,
      mode,
      expression: mode === "advanced" && value ? formatCron(value) : draft.value.expression,
    }
  }

  async function validate(): Promise<boolean> {
    if (localError.value) return false
    const current = generation
    const valid = await requestPreview()
    return valid && current === generation && !disposed
  }

  invalidate()
  onScopeDispose(() => {
    disposed = true
    generation++
    clearTimeout(timer)
  })
  return { draft, encoded, localError, preview, previewFailed, loading, setMode, refresh: requestPreview, validate }
}
