import { ref, shallowRef } from "vue"
import type { Ref, ShallowRef } from "vue"

export function createLatestAuditRequest<T>(fetcher: () => Promise<T>): () => Promise<T> {
  let latest: Promise<T>
  return async () => {
    let request = (latest = fetcher())
    while (true) {
      try {
        const response = await request
        if (request === latest) return response
      } catch (error) {
        if (request === latest) throw error
      }
      request = latest
    }
  }
}

export function useAuditDetail<T>(fetcher: (id: string) => Promise<{ data: T | null; error: unknown }>): {
  data: ShallowRef<T | null>
  loading: Ref<boolean>
  failed: Ref<boolean>
  load: (id: string | null) => Promise<void>
} {
  const data = shallowRef<T | null>(null)
  const loading = ref(false)
  const failed = ref(false)
  let generation = 0
  async function load(id: string | null) {
    const current = ++generation
    data.value = null
    failed.value = false
    loading.value = Boolean(id)
    if (!id) return
    try {
      const result = await fetcher(id)
      if (current !== generation) return
      data.value = result.error ? null : result.data
      failed.value = Boolean(result.error)
    } catch {
      if (current === generation) failed.value = true
    } finally {
      if (current === generation) loading.value = false
    }
  }
  return { data, loading, failed, load }
}
