import { computed, getCurrentScope, onScopeDispose, ref } from "vue"
import { DEFAULT_PAGE_SIZE } from "@/constants/pagination"
import { fetchDeliverySummary, fetchGetNotificationDeliveries, fetchRetryFailedDeliveries } from "@/service/api"

export const deliveryPermissions = {
  messages: "notification:read",
  list: "notification-delivery:read",
  summary: "notification-delivery:read",
  retry: "notification-delivery:retry",
} satisfies Record<string, PermissionCode>

export function isMessageId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim())
}

export function useDeliveryWorkbench(hasAuth: (permission: PermissionCode) => boolean) {
  const messageId = ref("")
  const summary = ref<Api.Notification.DeliverySummary | null>(null)
  const records = ref<Api.Notification.Delivery[]>([])
  const total = ref(0)
  const page = ref(1)
  const pageSize = ref(DEFAULT_PAGE_SIZE)
  const status = ref<Api.Notification.DeliveryStatus | null>(null)
  const loading = ref(false)
  const summaryLoading = ref(false)
  const retrying = ref(false)
  const summaryFailed = ref(false)
  const listFailed = ref(false)
  const updatedAt = ref<Date | null>(null)
  let summaryRequest = 0
  let listRequest = 0
  let disposed = false

  const failedCount = computed(() => summary.value?.byStatus?.dead ?? 0)
  const canRetry = computed(
    () =>
      !disposed &&
      Boolean(messageId.value) &&
      failedCount.value > 0 &&
      !retrying.value &&
      !summaryLoading.value &&
      !summaryFailed.value &&
      hasAuth(deliveryPermissions.retry),
  )

  async function loadSummary() {
    if (!messageId.value || !hasAuth(deliveryPermissions.summary) || disposed) return
    const request = ++summaryRequest
    const id = messageId.value
    summaryLoading.value = true
    summaryFailed.value = false
    try {
      const { data, error } = await fetchDeliverySummary(id)
      if (disposed || request !== summaryRequest) return
      summaryFailed.value = Boolean(error || !data)
      summary.value = !error && data ? data : null
      if (!error && data) updatedAt.value = new Date()
    } finally {
      if (request === summaryRequest && !disposed) summaryLoading.value = false
    }
  }

  async function loadRows() {
    if (!messageId.value || !hasAuth(deliveryPermissions.list) || disposed) return
    const request = ++listRequest
    loading.value = true
    listFailed.value = false
    try {
      const { data, error } = await fetchGetNotificationDeliveries({
        messageId: messageId.value,
        status: status.value ?? undefined,
        page: page.value,
        pageSize: pageSize.value,
      })
      if (disposed || request !== listRequest) return
      listFailed.value = Boolean(error || !data)
      if (!error && data) {
        const lastPage = Math.max(1, Math.ceil(data.total / pageSize.value))
        if (page.value > lastPage) {
          page.value = lastPage
          await loadRows()
          return
        }
      }
      records.value = !error && data ? data.records : []
      total.value = !error && data ? data.total : 0
      if (!error && data) updatedAt.value = new Date()
    } finally {
      if (request === listRequest && !disposed) loading.value = false
    }
  }

  async function refresh() {
    await Promise.all([loadSummary(), loadRows()])
  }

  async function selectMessage(value: string) {
    if (!isMessageId(value) || disposed) return false
    summaryRequest++
    listRequest++
    messageId.value = value.trim().toLowerCase()
    summary.value = null
    records.value = []
    total.value = 0
    updatedAt.value = null
    summaryFailed.value = false
    listFailed.value = false
    loading.value = false
    summaryLoading.value = false
    page.value = 1
    status.value = null
    await refresh()
    return true
  }

  async function setStatus(value: Api.Notification.DeliveryStatus | null) {
    status.value = value
    page.value = 1
    records.value = []
    await loadRows()
  }

  async function setPage(value: number) {
    page.value = value
    await loadRows()
  }

  async function setPageSize(value: number) {
    pageSize.value = value
    page.value = 1
    await loadRows()
  }

  async function retry() {
    if (disposed || !canRetry.value) return null
    const id = messageId.value
    retrying.value = true
    try {
      const { data, error } = await fetchRetryFailedDeliveries(id)
      if (error || !data || disposed) return null
      if (messageId.value === id) await refresh()
      return data.retried ?? 0
    } finally {
      retrying.value = false
    }
  }

  if (getCurrentScope())
    onScopeDispose(() => {
      disposed = true
      summaryRequest++
      listRequest++
    })

  return {
    messageId,
    summary,
    records,
    total,
    page,
    pageSize,
    status,
    loading,
    summaryLoading,
    summaryFailed,
    listFailed,
    updatedAt,
    retrying,
    failedCount,
    canRetry,
    selectMessage,
    setStatus,
    setPage,
    setPageSize,
    refresh,
    retry,
  }
}
