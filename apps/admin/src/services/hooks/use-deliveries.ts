import { useEffect, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { usePermission } from "@/features/auth"
import { hasPermission } from "@/features/auth/permissions"
import { useAuthStore } from "@/stores/auth"
import { useLocaleStore } from "@/stores/locale"
import { getAuthSession } from "@/services/auth-session"
import type { PermissionCode } from "@/typings/permission-codes"
import { fetchAnnouncements, type AnnouncementList } from "@/services/api/announcement"
import { announcementKeys } from "./use-announcements"
import {
  fetchNotificationDeliveries,
  fetchDeliverySummary,
  retryFailedDeliveries,
  type DeliveryStatus,
  type DeliveryPage,
  type DeliverySummary,
} from "@/services/api/notification-delivery"
import {
  normalizeDeliveryMessageId,
  retryMessageAllowed,
} from "@/views/notification/manage/deliveries/modules/delivery-model"
export const deliveryKeys = {
  all: (session: number) => ["notification-deliveries", session] as const,
  message: (session: number, id: string) => ["notification-deliveries", session, id] as const,
}
export function requireDeliveryPermission(code: PermissionCode, session: number) {
  if (session !== getAuthSession()) throw new Error("Delivery workbench session changed")
  const state = useAuthStore.getState()
  if (!state.token || !hasPermission(state.userInfo, code)) throw new Error("Delivery operation permission revoked")
}
async function deliveryData<T>(pending: Promise<{ data: T | null; error: unknown }>) {
  const result = await pending
  if (result.error) throw result.error
  if (result.data === null) throw new Error("Delivery response is empty")
  return result.data
}
interface DeliveryView {
  messageId: string
  status: DeliveryStatus | null
  page: number
  pageSize: number
}
export function useDeliveryWorkbench() {
  useAuthStore((state) => state.token)
  const session = useRef(getAuthSession()).current,
    sameSession = session === getAuthSession(),
    locale = useLocaleStore((state) => state.locale),
    client = useQueryClient(),
    read = usePermission("notification-delivery:read"),
    messagesRead = usePermission("notification:read"),
    retryAllowed = usePermission("notification-delivery:retry"),
    canRead = sameSession && read,
    canReadMessages = sameSession && messagesRead
  const [view, setView] = useState<DeliveryView>({ messageId: "", status: null, page: 1, pageSize: 20 }),
    lock = useRef(false),
    alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      void client.cancelQueries({
        queryKey: deliveryKeys.all(session),
        predicate: (query) => query.getObserversCount() === 0,
      })
      void client.cancelQueries({
        queryKey: [...announcementKeys.all(session), "delivery-options"],
        predicate: (query) => query.getObserversCount() === 0,
      })
    }
  }, [client, session])
  // Retained confirmations must inspect the latest committed query identity after awaits.
  const current = useRef({ view, locale })
  current.current = { view, locale }
  const optionsKey = [...announcementKeys.all(session), "delivery-options", locale]
  const recentQuery = useQuery({
    queryKey: optionsKey,
    queryFn: () => {
      requireDeliveryPermission("notification:read", session)
      return deliveryData(fetchAnnouncements({ page: 1, pageSize: 20, displayMode: "inbox" }))
    },
    enabled: canReadMessages,
    staleTime: 0,
    retry: false,
  })
  const recentMessages = canReadMessages && !recentQuery.isError ? (recentQuery.data?.records ?? []) : []
  const selectMessage = (value: string) => {
    const id = normalizeDeliveryMessageId(value)
    if (!id || !sameSession || !alive.current) return false
    // A deliberate lookup is fresh even when its UUID equals the current selection.
    void client.resetQueries({
      queryKey: [...deliveryKeys.message(session, id), "summary", current.current.locale],
      exact: true,
    })
    void client.resetQueries({
      queryKey: [
        ...deliveryKeys.message(session, id),
        "rows",
        current.current.locale,
        { page: 1, pageSize: current.current.view.pageSize, status: null },
      ],
      exact: true,
    })
    setView((previous) => ({ ...previous, messageId: id, status: null, page: 1 }))
    return true
  }
  useEffect(() => {
    if (
      !view.messageId &&
      canReadMessages &&
      !recentQuery.isFetching &&
      !recentQuery.isError &&
      recentQuery.data?.records[0]
    )
      selectMessage(recentQuery.data.records[0].id)
  }, [view.messageId, canReadMessages, recentQuery.isFetching, recentQuery.isError, recentQuery.data])
  const id = view.messageId,
    valid = Boolean(normalizeDeliveryMessageId(id)),
    prefix = deliveryKeys.message(session, id),
    summaryKey = [...prefix, "summary", locale],
    rowsKey = [...prefix, "rows", locale, { page: view.page, pageSize: view.pageSize, status: view.status }]
  const summaryQuery = useQuery({
    queryKey: summaryKey,
    queryFn: () => {
      requireDeliveryPermission("notification-delivery:read", session)
      return deliveryData(fetchDeliverySummary(id))
    },
    enabled: canRead && valid,
    staleTime: 0,
    retry: false,
  })
  const rowsQuery = useQuery({
    queryKey: rowsKey,
    queryFn: () => {
      requireDeliveryPermission("notification-delivery:read", session)
      return deliveryData(
        fetchNotificationDeliveries({
          messageId: id,
          status: view.status ?? undefined,
          page: view.page,
          pageSize: view.pageSize,
        }),
      )
    },
    enabled: canRead && valid,
    staleTime: 0,
    retry: false,
  })
  const summaryLoading = canRead && valid && (summaryQuery.isPending || summaryQuery.isFetching),
    loading = canRead && valid && (rowsQuery.isPending || rowsQuery.isFetching)
  const summary = canRead && !summaryQuery.isError && !summaryLoading ? summaryQuery.data : undefined,
    records = canRead && !rowsQuery.isError && !loading ? (rowsQuery.data?.records ?? []) : [],
    total = canRead && !rowsQuery.isError ? (rowsQuery.data?.total ?? 0) : 0
  useEffect(() => {
    if (!canRead || !valid || !rowsQuery.isSuccess || rowsQuery.isFetching) return
    const last = Math.max(1, Math.ceil(rowsQuery.data.total / view.pageSize))
    if (view.page > last) setView((previous) => ({ ...previous, page: last }))
  }, [canRead, valid, rowsQuery.isSuccess, rowsQuery.isFetching, rowsQuery.data, view.page, view.pageSize])
  const currentMessage =
    summary?.message ??
    records.find((row) => row.messageId === id)?.message ??
    recentMessages.find((row) => row.id === id) ??
    null
  const failedCount = summary?.byStatus?.dead ?? 0
  const mutation = useMutation({
    mutationFn: async (messageId: string) => {
      if (!alive.current) throw new Error("Delivery workbench unmounted")
      requireDeliveryPermission("notification-delivery:read", session)
      requireDeliveryPermission("notification-delivery:retry", session)
      const latest = current.current
      if (messageId !== latest.view.messageId) throw new Error("Delivery message changed")
      const key = [...deliveryKeys.message(session, messageId), "summary", latest.locale],
        state = client.getQueryState<DeliverySummary>(key),
        data = state?.data
      if (state?.status !== "success" || state.fetchStatus !== "idle" || !data || (data.byStatus?.dead ?? 0) <= 0)
        throw new Error("Delivery summary is unavailable for retry")
      const table = client.getQueryData<DeliveryPage>([
        ...deliveryKeys.message(session, messageId),
        "rows",
        latest.locale,
        { page: latest.view.page, pageSize: latest.view.pageSize, status: latest.view.status },
      ])
      const auth = useAuthStore.getState(),
        messages =
          auth.token && hasPermission(auth.userInfo, "notification:read")
            ? client.getQueryData<AnnouncementList>([
                ...announcementKeys.all(session),
                "delivery-options",
                latest.locale,
              ])?.records
            : undefined
      const message =
        data.message ??
        table?.records.find((row) => row.messageId === messageId)?.message ??
        messages?.find((row) => row.id === messageId)
      if (!retryMessageAllowed(message)) throw new Error("Delivery message is not eligible for retry")
      return deliveryData(retryFailedDeliveries(messageId))
    },
    onSuccess: async (_data, messageId) => {
      if (session !== getAuthSession()) return
      const queryKey = deliveryKeys.message(session, messageId)
      await client.cancelQueries({ queryKey })
      if (session === getAuthSession()) await client.invalidateQueries({ queryKey })
    },
  })
  const retry = async (confirmedId = current.current.view.messageId): Promise<number> => {
    if (!alive.current) throw new Error("Delivery workbench unmounted")
    requireDeliveryPermission("notification-delivery:read", session)
    requireDeliveryPermission("notification-delivery:retry", session)
    if (confirmedId !== current.current.view.messageId) throw new Error("Delivery message changed")
    if (lock.current) throw new Error("Delivery retry is already pending")
    lock.current = true
    try {
      const messageId = confirmedId,
        data = await mutation.mutateAsync(messageId)
      if (!alive.current) throw new Error("Delivery workbench unmounted")
      requireDeliveryPermission("notification-delivery:retry", session)
      if (messageId !== current.current.view.messageId) throw new Error("Delivery message changed")
      return data.retried ?? 0
    } finally {
      lock.current = false
    }
  }
  const refresh = async () => {
    await Promise.all([
      ...(canRead && valid ? [summaryQuery.refetch(), rowsQuery.refetch()] : []),
      ...(canReadMessages ? [recentQuery.refetch()] : []),
    ])
  }
  return {
    ...view,
    canReadMessages,
    recentMessages,
    recentQuery,
    summary,
    records,
    total,
    currentMessage,
    failedCount,
    summaryLoading,
    loading,
    summaryFailed: canRead && valid && summaryQuery.isError,
    listFailed: canRead && valid && rowsQuery.isError,
    messagesFailed: canReadMessages && recentQuery.isError,
    messagesLoading: canReadMessages && recentQuery.isFetching,
    updatedAt: Math.max(summaryQuery.dataUpdatedAt, rowsQuery.dataUpdatedAt) || null,
    retrying: mutation.isPending,
    canRetry:
      canRead &&
      retryAllowed &&
      failedCount > 0 &&
      !summaryLoading &&
      !summaryQuery.isError &&
      !mutation.isPending &&
      retryMessageAllowed(currentMessage),
    selectMessage,
    setStatus: (status: DeliveryStatus | null) => setView((previous) => ({ ...previous, status, page: 1 })),
    setPage: (page: number) => setView((previous) => ({ ...previous, page })),
    setPageSize: (pageSize: number) => setView((previous) => ({ ...previous, pageSize, page: 1 })),
    refresh,
    retry,
  }
}
