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
  const recalledMessageIds = ref<ReadonlySet<string>>(new Set())
  const sessionEpoch = ref(0)

  let unreadRequestId = 0
  let latestRequestId = 0
  let pendingLatestRequests = 0
  let latestRequest: { tab: DrawerTab; epoch: number; id: number; promise: Promise<void> } | null = null
  let calibration: Promise<void> | null = null

  const badgeText = computed(() => (unreadCount.value > 99 ? "99+" : String(unreadCount.value)))
  const hasUnread = computed(() => unreadCount.value > 0)

  function isRecalled(message: Api.Notification.Message) {
    return message.status === "recalled" || recalledMessageIds.value.has(message.messageId)
  }

  function sanitizeMessage(message: Api.Notification.Message): Api.Notification.Message {
    if (!isRecalled(message)) return message
    return {
      ...message,
      status: "recalled",
      contentMode: "raw",
      title: "",
      content: "",
      contentParams: null,
      action: null,
      mandatory: false,
    }
  }

  function filterLatest(messages: Api.Notification.Message[]) {
    if (activeTab.value === "unread") return messages.filter((message) => !message.readAt && !isRecalled(message))
    if (activeTab.value === "announcement")
      return messages.filter((message) => message.category === "admin.announcement")
    return messages
  }

  function rememberRecalls(messageIds: string[], cachedMessages: Api.Notification.Message[] = []) {
    const added = messageIds.filter((messageId) => !recalledMessageIds.value.has(messageId))
    if (!added.length) return
    const recalledUnreadIds = new Set(
      [...latest.value, ...cachedMessages]
        .filter((message) => added.includes(message.messageId) && !message.readAt && !isRecalled(message))
        .map((message) => message.id),
    )
    unreadCount.value = Math.max(0, unreadCount.value - recalledUnreadIds.size)
    recalledMessageIds.value = new Set([...recalledMessageIds.value, ...added])
    latest.value = filterLatest(latest.value.map(sanitizeMessage))
    return refreshUnreadCount().catch(() => {
      // Keep cached recalls authoritative when defensive unread calibration is unavailable.
    })
  }

  /** Apply session recalls to every HTTP page before it enters an inbox cache. */
  function normalizeMessages(messages: Api.Notification.Message[], cachedMessages: Api.Notification.Message[] = []) {
    void rememberRecalls(
      messages.filter((message) => message.status === "recalled").map((message) => message.messageId),
      cachedMessages,
    )
    return messages.map(sanitizeMessage)
  }

  async function refreshUnreadCount() {
    const epoch = sessionEpoch.value
    const requestId = ++unreadRequestId
    const { data, error } = await fetchGetUnreadCount()
    if (epoch === sessionEpoch.value && requestId === unreadRequestId && !error && data) unreadCount.value = data.count
  }

  function refreshLatest(force = false): Promise<void> {
    const epoch = sessionEpoch.value
    const tab = activeTab.value
    if (!force && latestRequest?.epoch === epoch && latestRequest.tab === tab) return latestRequest.promise
    const requestId = ++latestRequestId
    pendingLatestRequests += 1
    loading.value = true
    const promise = (async () => {
      try {
        const query: Api.Notification.InboxQuery = { size: 20 }
        if (tab === "unread") query.unreadOnly = true

        const { data, error } = await fetchGetNotifications(query)
        if (error || !data) return
        if (epoch !== sessionEpoch.value || requestId !== latestRequestId || tab !== activeTab.value) return

        latest.value = filterLatest(normalizeMessages(data.items))
      } finally {
        if (latestRequest?.id === requestId) latestRequest = null
        if (epoch === sessionEpoch.value) {
          pendingLatestRequests = Math.max(0, pendingLatestRequests - 1)
          loading.value = pendingLatestRequests > 0
        }
      }
    })()
    latestRequest = { tab, epoch, id: requestId, promise }
    return promise
  }

  function calibrate(): Promise<void> {
    if (calibration) return calibration
    const epoch = sessionEpoch.value
    calibration = Promise.all([refreshUnreadCount(), refreshLatest()])
      .then(() => {})
      .finally(() => {
        if (epoch === sessionEpoch.value) calibration = null
      })
    return calibration
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
    if (target && isRecalled(target)) return
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
        readAt: isRecalled(message) ? message.readAt : (message.readAt ?? new Date().toISOString()),
      }))
    } catch (error) {
      await calibrate()
      throw error
    }
  }

  function onRealtimeNew(message: Api.Notification.Message) {
    if (isRecalled(message)) {
      void rememberRecalls([message.messageId])
      return
    }
    const isDuplicate = latest.value.some((cached) => cached.id === message.id)
    latest.value = [message, ...latest.value.filter((cached) => cached.id !== message.id)]
    if (!isDuplicate && !message.readAt) unreadCount.value += 1
  }

  async function onRealtimeRecalled(messageId: string) {
    await rememberRecalls([messageId])
  }

  function onRealtimeUnreadCount(count: number) {
    unreadRequestId += 1
    unreadCount.value = count
  }

  function reset() {
    sessionEpoch.value += 1
    latestRequest = null
    calibration = null
    recalledMessageIds.value = new Set()
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
    recalledMessageIds,
    sessionEpoch,
    isRecalled,
    normalizeMessages,
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
