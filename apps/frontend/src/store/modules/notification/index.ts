import { computed, ref } from "vue"
import { defineStore } from "pinia"
import { SetupStoreId } from "@/enum"
import {
  fetchGetNotifications,
  fetchGetUnreadCount,
  fetchReadAllNotifications,
  fetchReadNotification,
} from "@/service/api"

export type DrawerTab = "all" | "unread" | "announcement"

export const useNotificationStore = defineStore(SetupStoreId.Notification, () => {
  const unreadCount = ref(0)
  const drawerVisible = ref(false)
  const activeTab = ref<DrawerTab>("all")
  const latest = ref<Api.Notification.Message[]>([])
  const loading = ref(false)

  let requestEpoch = 0
  let unreadRequestId = 0
  let latestRequestId = 0
  let pendingLatestRequests = 0

  const badgeText = computed(() => (unreadCount.value > 99 ? "99+" : String(unreadCount.value)))
  const hasUnread = computed(() => unreadCount.value > 0)

  async function refreshUnreadCount() {
    const epoch = requestEpoch
    const requestId = ++unreadRequestId
    const { data, error } = await fetchGetUnreadCount()
    if (epoch === requestEpoch && requestId === unreadRequestId && !error && data) unreadCount.value = data.count
  }

  async function refreshLatest() {
    const epoch = requestEpoch
    const requestId = ++latestRequestId
    const tab = activeTab.value
    pendingLatestRequests += 1
    loading.value = true
    try {
      const query: Api.Notification.InboxQuery = { size: 20 }
      if (tab === "unread") query.unreadOnly = true

      const { data, error } = await fetchGetNotifications(query)
      if (error || !data) return
      if (epoch !== requestEpoch || requestId !== latestRequestId || tab !== activeTab.value) return

      latest.value =
        tab === "announcement"
          ? data.items.filter((item) => item.category === "admin.announcement")
          : data.items
    } finally {
      if (epoch === requestEpoch) {
        pendingLatestRequests = Math.max(0, pendingLatestRequests - 1)
        loading.value = pendingLatestRequests > 0
      }
    }
  }

  async function calibrate() {
    await Promise.all([refreshUnreadCount(), refreshLatest()])
  }

  function setTab(tab: DrawerTab) {
    activeTab.value = tab
    void refreshLatest()
  }

  function openDrawer() {
    drawerVisible.value = true
    void calibrate()
  }

  function closeDrawer() {
    drawerVisible.value = false
  }

  async function markRead(id: string) {
    const target = latest.value.find((message) => message.id === id)
    if (target && !target.readAt) {
      target.readAt = new Date().toISOString()
      unreadCount.value = Math.max(0, unreadCount.value - 1)
    }

    try {
      const { error } = await fetchReadNotification(id)
      if (error) await calibrate()
    } catch (error) {
      await calibrate()
      throw error
    }
  }

  async function markAllRead() {
    try {
      const { error } = await fetchReadAllNotifications()
      if (error) {
        await calibrate()
        return
      }

      unreadCount.value = 0
      latest.value = latest.value.map((message) => ({
        ...message,
        readAt: message.readAt ?? new Date().toISOString(),
      }))
    } catch (error) {
      await calibrate()
      throw error
    }
  }

  function onRealtimeNew(message: Api.Notification.Message) {
    const isDuplicate = latest.value.some((cached) => cached.id === message.id)
    latest.value = [message, ...latest.value.filter((cached) => cached.id !== message.id)]
    if (!isDuplicate && !message.readAt) unreadCount.value += 1
  }

  async function onRealtimeRecalled(messageId: string) {
    latest.value = latest.value.map((message) =>
      message.messageId === messageId ? { ...message, status: "recalled", action: null } : message,
    )
    await refreshUnreadCount()
  }

  function onRealtimeUnreadCount(count: number) {
    unreadCount.value = count
  }

  function reset() {
    requestEpoch += 1
    pendingLatestRequests = 0
    unreadCount.value = 0
    drawerVisible.value = false
    activeTab.value = "all"
    latest.value = []
    loading.value = false
  }

  return {
    unreadCount,
    drawerVisible,
    activeTab,
    latest,
    loading,
    badgeText,
    hasUnread,
    refreshUnreadCount,
    refreshLatest,
    calibrate,
    setTab,
    openDrawer,
    closeDrawer,
    markRead,
    markAllRead,
    onRealtimeNew,
    onRealtimeRecalled,
    onRealtimeUnreadCount,
    reset,
  }
})
