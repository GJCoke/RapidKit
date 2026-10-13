import { computed, ref, watch } from "vue"
import {
  fetchArchiveNotification,
  fetchDeleteNotification,
  fetchGetNotifications,
  fetchReadNotification,
} from "@/service/api"
import { useNotificationStore } from "@/store/modules/notification"

export interface InboxFilters {
  unreadOnly?: boolean
  archived?: "active" | "archived" | "all"
  category?: string
  level?: Api.Notification.Level
  createdFrom?: string
  createdTo?: string
}

export function useInbox() {
  const notificationStore = useNotificationStore()
  const items = ref<Api.Notification.Message[]>([])
  const nextCursor = ref<string | null>(null)
  const loading = ref(false)
  const filters = ref<InboxFilters>({})

  let generation = 0
  let pendingRequests = 0

  const visibleItems = computed(() =>
    filters.value.unreadOnly
      ? items.value.filter((item) => !item.readAt && !notificationStore.isRecalled(item))
      : items.value,
  )

  watch(
    () => notificationStore.recalledMessageIds,
    () => {
      items.value = notificationStore.normalizeMessages(items.value)
    },
    { flush: "sync" },
  )

  watch(
    () => notificationStore.sessionEpoch,
    () => {
      generation += 1
      pendingRequests = 0
      items.value = []
      nextCursor.value = null
      loading.value = false
    },
    { flush: "sync" },
  )

  async function load(reset = false) {
    if (!reset && pendingRequests > 0) return

    if (reset) {
      generation += 1
      pendingRequests = 0
      items.value = []
      nextCursor.value = null
    }

    const requestGeneration = generation
    const query: Api.Notification.InboxQuery = { size: 20 }
    if (filters.value.unreadOnly) query.unreadOnly = true
    if (filters.value.archived) query.archived = filters.value.archived
    if (filters.value.category) query.category = filters.value.category
    if (filters.value.level) query.level = filters.value.level
    if (filters.value.createdFrom) query.createdFrom = filters.value.createdFrom
    if (filters.value.createdTo) query.createdTo = filters.value.createdTo
    if (!reset && nextCursor.value) query.cursor = nextCursor.value

    pendingRequests += 1
    loading.value = true
    try {
      const { data, error } = await fetchGetNotifications(query)
      if (requestGeneration !== generation || error || !data) return
      const normalized = notificationStore.normalizeMessages(data.items, items.value)

      if (reset) {
        items.value = [...new Map(normalized.map((item) => [item.id, item])).values()]
      } else {
        const merged = new Map(items.value.map((item) => [item.id, item]))
        for (const item of normalized) merged.set(item.id, item)
        items.value = [...merged.values()]
      }
      nextCursor.value = data.nextCursor ?? null
    } finally {
      if (requestGeneration === generation) {
        pendingRequests = Math.max(0, pendingRequests - 1)
        loading.value = pendingRequests > 0
      }
    }
  }

  function applyFilters(next: Partial<InboxFilters>) {
    filters.value = { ...filters.value, ...next }
    void load(true)
  }

  async function readOne(id: string): Promise<boolean> {
    const target = items.value.find((item) => item.id === id)
    if (target && notificationStore.isRecalled(target)) return true
    const epoch = notificationStore.sessionEpoch
    try {
      const { error } = await fetchReadNotification(id)
      if (error || epoch !== notificationStore.sessionEpoch) return false
      const target = items.value.find((item) => item.id === id)
      if (target && !target.readAt && !notificationStore.isRecalled(target)) target.readAt = new Date().toISOString()
      return true
    } catch {
      return false
    }
  }

  async function archiveOne(id: string): Promise<boolean> {
    try {
      const { error } = await fetchArchiveNotification(id)
      if (error) return false
      items.value = items.value.filter((item) => item.id !== id)
      return true
    } catch {
      return false
    }
  }

  async function deleteOne(id: string): Promise<boolean> {
    try {
      const { error } = await fetchDeleteNotification(id)
      if (error) return false
      const wasUnread = items.value.some(
        (item) => item.id === id && !item.readAt && !notificationStore.isRecalled(item),
      )
      items.value = items.value.filter((item) => item.id !== id)
      if (wasUnread) {
        try {
          await notificationStore.refreshUnreadCount()
        } catch {
          // Deletion remains authoritative even if the defensive calibration throws.
        }
      }
      return true
    } catch {
      return false
    }
  }

  return {
    items,
    visibleItems,
    nextCursor,
    loading,
    filters,
    load,
    applyFilters,
    readOne,
    archiveOne,
    deleteOne,
  }
}
