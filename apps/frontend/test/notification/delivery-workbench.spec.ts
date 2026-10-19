import { beforeEach, describe, expect, it, vi } from "vitest"
import { effectScope } from "vue"

const api = vi.hoisted(() => ({
  fetchDeliverySummary: vi.fn(),
  fetchGetNotificationDeliveries: vi.fn(),
  fetchRetryFailedDeliveries: vi.fn(),
}))
vi.mock("@/service/api", () => api)

import { useDeliveryWorkbench } from "@/views/notification/manage/deliveries/composables/use-delivery-workbench"

const firstId = "0199f3d1-724a-7e80-9c12-0abc1200a001"
const secondId = "0199f3d1-724a-7e80-9c12-0abc1200a002"

function delivery(messageId = firstId): Api.Notification.Delivery {
  return {
    id: "0199f3d1-724a-7e80-9c12-0abc1200b001",
    messageId,
    userId: "0199f3d1-724a-7e80-9c12-0abc1200c001",
    createTime: "2026-10-13 15:20:00",
    updateTime: "2026-10-13 15:21:00",
    channel: "in_app",
    status: "dead",
    attemptCount: 5,
    lastErrorCode: "inapp_emit_failed",
    nextAttemptAt: null,
    lockedUntil: null,
    sentAt: null,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe("delivery workbench", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    api.fetchDeliverySummary.mockImplementation(async (id: string) => ({
      data: { messageId: id, byStatus: { dead: 1 } },
      error: null,
    }))
    api.fetchGetNotificationDeliveries.mockImplementation(async (query) => ({
      data: { records: [delivery(query.messageId)], total: 1, current: query.page, size: query.pageSize },
      error: null,
    }))
    api.fetchRetryFailedDeliveries.mockResolvedValue({ data: { retried: 1 }, error: null })
  })

  it("loads the selected message and sends status / pagination to the server", async () => {
    const state = useDeliveryWorkbench(() => true)
    await state.selectMessage(` ${firstId} `)
    expect(state.records.value[0]?.messageId).toBe(firstId)
    await state.setPage(3)
    await state.setStatus("dead")
    expect(state.page.value).toBe(1)
    expect(api.fetchGetNotificationDeliveries).toHaveBeenLastCalledWith({
      messageId: firstId,
      status: "dead",
      page: 1,
      pageSize: 20,
    })
    await state.setPageSize(500)
    expect(state.pageSize.value).toBe(500)
    expect(api.fetchGetNotificationDeliveries).toHaveBeenLastCalledWith({
      messageId: firstId,
      status: "dead",
      page: 1,
      pageSize: 500,
    })
  })

  it("rejects an invalid ID without replacing the current query", async () => {
    const state = useDeliveryWorkbench(() => true)
    await state.selectMessage(firstId)
    expect(await state.selectMessage("bad-id")).toBe(false)
    expect(state.messageId.value).toBe(firstId)
    expect(api.fetchDeliverySummary).toHaveBeenCalledTimes(1)
  })

  it("clears old data on message switch and ignores responses for the previous message", async () => {
    const oldSummary = deferred<any>()
    const oldRows = deferred<any>()
    api.fetchDeliverySummary.mockReturnValueOnce(oldSummary.promise)
    api.fetchGetNotificationDeliveries.mockReturnValueOnce(oldRows.promise)
    const state = useDeliveryWorkbench(() => true)
    const oldQuery = state.selectMessage(firstId)
    const newQuery = state.selectMessage(secondId)
    expect(state.summary.value).toBeNull()
    expect(state.records.value).toEqual([])
    await newQuery
    oldSummary.resolve({ data: { messageId: firstId, byStatus: { dead: 999 } }, error: null })
    oldRows.resolve({ data: { records: [delivery(firstId)], total: 999 }, error: null })
    await oldQuery
    expect(state.summary.value?.messageId).toBe(secondId)
    expect(state.records.value[0]?.messageId).toBe(secondId)
    expect(state.total.value).toBe(1)
  })

  it("ignores an old page response after the status filter changes", async () => {
    const state = useDeliveryWorkbench(() => true)
    await state.selectMessage(firstId)
    const oldRows = deferred<any>()
    api.fetchGetNotificationDeliveries.mockReturnValueOnce(oldRows.promise)
    const oldQuery = state.setPage(2)
    api.fetchGetNotificationDeliveries.mockResolvedValueOnce({ data: { records: [], total: 0 }, error: null })
    await state.setStatus("sent")
    oldRows.resolve({ data: { records: [delivery()], total: 100 }, error: null })
    await oldQuery
    expect(state.records.value).toEqual([])
    expect(state.total.value).toBe(0)
    expect(state.loading.value).toBe(false)
  })

  it("clears a failed refresh rather than showing stale results as current", async () => {
    const state = useDeliveryWorkbench(() => true)
    await state.selectMessage(firstId)
    api.fetchDeliverySummary.mockResolvedValueOnce({ data: null, error: new Error("summary failed") })
    api.fetchGetNotificationDeliveries.mockResolvedValueOnce({ data: null, error: new Error("list failed") })
    await state.refresh()
    expect(state.summary.value).toBeNull()
    expect(state.records.value).toEqual([])
    expect(state.summaryFailed.value).toBe(true)
    expect(state.listFailed.value).toBe(true)
    expect(state.canRetry.value).toBe(false)
  })

  it("retries only the selected message and refreshes the summary and current filter", async () => {
    const state = useDeliveryWorkbench(() => true)
    await state.selectMessage(firstId)
    await state.setStatus("dead")
    api.fetchDeliverySummary.mockResolvedValueOnce({
      data: { messageId: firstId, byStatus: { pending: 1 } },
      error: null,
    })
    api.fetchGetNotificationDeliveries.mockResolvedValueOnce({ data: { records: [], total: 0 }, error: null })
    expect(await state.retry()).toBe(1)
    expect(api.fetchRetryFailedDeliveries).toHaveBeenCalledWith(firstId)
    expect(state.status.value).toBe("dead")
    expect(state.records.value).toEqual([])
    expect(state.canRetry.value).toBe(false)
  })

  it("returns to a valid page when refreshed records shrink below the current page", async () => {
    api.fetchGetNotificationDeliveries.mockImplementation(async (query) => ({
      data: { records: [delivery(query.messageId)], total: 21, current: query.page, size: query.pageSize },
      error: null,
    }))
    const state = useDeliveryWorkbench(() => true)
    await state.selectMessage(firstId)
    await state.setPage(3)
    api.fetchGetNotificationDeliveries
      .mockResolvedValueOnce({ data: { records: [], total: 1, current: 3, size: 10 }, error: null })
      .mockResolvedValueOnce({
        data: { records: [{ ...delivery(), status: "pending" }], total: 1, current: 1, size: 10 },
        error: null,
      })
    await state.refresh()
    expect(state.page.value).toBe(1)
    expect(state.records.value[0]?.status).toBe("pending")
  })

  it("does not refresh the previous message if selection changes during a retry", async () => {
    const state = useDeliveryWorkbench(() => true)
    await state.selectMessage(firstId)
    const request = deferred<any>()
    api.fetchRetryFailedDeliveries.mockReturnValueOnce(request.promise)
    const retry = state.retry()
    await state.selectMessage(secondId)
    request.resolve({ data: { retried: 1 }, error: null })
    await retry
    expect(state.messageId.value).toBe(secondId)
    expect(state.summary.value?.messageId).toBe(secondId)
    expect(api.fetchDeliverySummary).toHaveBeenCalledTimes(2)
  })

  it("does not submit a retry after the workbench has unmounted", async () => {
    const scope = effectScope()
    const state = scope.run(() => useDeliveryWorkbench(() => true))!
    await state.selectMessage(firstId)
    expect(state.canRetry.value).toBe(true)
    scope.stop()
    expect(await state.retry()).toBeNull()
    expect(api.fetchRetryFailedDeliveries).not.toHaveBeenCalled()
  })

  it("does not call endpoints without permission or retry when there are no failures", async () => {
    const denied = useDeliveryWorkbench(() => false)
    await denied.selectMessage(firstId)
    expect(await denied.retry()).toBeNull()
    expect(api.fetchDeliverySummary).not.toHaveBeenCalled()
    expect(api.fetchGetNotificationDeliveries).not.toHaveBeenCalled()
    expect(api.fetchRetryFailedDeliveries).not.toHaveBeenCalled()
    const state = useDeliveryWorkbench(() => true)
    api.fetchDeliverySummary.mockResolvedValueOnce({ data: { messageId: firstId, byStatus: { sent: 5 } }, error: null })
    await state.selectMessage(firstId)
    expect(await state.retry()).toBeNull()
    expect(api.fetchRetryFailedDeliveries).not.toHaveBeenCalled()
  })
})
