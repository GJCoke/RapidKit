import { ref } from "vue"
import { fetchGetNotificationPreferences, fetchUpdateNotificationPreference } from "@/service/api"

export function useNotificationPreferences() {
  const items = ref<Api.Notification.PreferenceItem[]>([])
  const loading = ref(false)
  const saving = ref<Record<string, number>>({})

  let loadRequestId = 0
  const toggleRequestIds = new Map<string, number>()

  async function load() {
    const requestId = ++loadRequestId
    loading.value = true
    try {
      const { data, error } = await fetchGetNotificationPreferences()
      if (requestId === loadRequestId && !error && data) items.value = data
    } finally {
      if (requestId === loadRequestId) loading.value = false
    }
  }

  async function toggle(item: Api.Notification.PreferenceItem, enabled: boolean): Promise<boolean> {
    const previous = item.enabled
    const requestId = (toggleRequestIds.get(item.category) ?? 0) + 1
    toggleRequestIds.set(item.category, requestId)
    saving.value = { ...saving.value, [item.category]: (saving.value[item.category] ?? 0) + 1 }
    item.enabled = enabled

    try {
      const { data, error } = await fetchUpdateNotificationPreference(item.category, enabled)
      if (toggleRequestIds.get(item.category) !== requestId) return false
      if (error || !data) {
        item.enabled = previous
        return false
      }
      item.enabled = data.enabled
      return true
    } catch {
      if (toggleRequestIds.get(item.category) === requestId) item.enabled = previous
      return false
    } finally {
      const remaining = Math.max(0, (saving.value[item.category] ?? 1) - 1)
      saving.value = { ...saving.value, [item.category]: remaining }
    }
  }

  function isSaving(category: string) {
    return (saving.value[category] ?? 0) > 0
  }

  return { items, loading, load, toggle, isSaving }
}
