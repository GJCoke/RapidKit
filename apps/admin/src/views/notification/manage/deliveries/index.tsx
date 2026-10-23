import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  Badge,
  Button,
  Input,
  toast,
} from "@rapidkit/ui"
import { usePermission } from "@/features/auth"
import { useAuthStore } from "@/stores/auth"
import { useAppStore } from "@/stores/app"
import { getAuthSession } from "@/services/auth-session"
import { useDeliveryWorkbench, requireDeliveryPermission } from "@/services/hooks/use-deliveries"
import type { Delivery } from "@/services/api/notification-delivery"
import { PageHeader } from "@/features/layout/components/page-header"
import { EmptyState, ErrorState } from "@/features/layout/components/states"
import { DataTable, type DataTableColumn } from "@/shared/data-table"
import { SearchableChoice } from "@/shared/crud/searchable-choice"
import { translateText } from "@/shared/i18n-text"
import { AnnouncementDetail } from "../announcements/modules/announcement-detail"
import {
  deliveryStates,
  deliveryTime,
  normalizeDeliveryMessageId,
  deliveryMessageTitle,
} from "./modules/delivery-model"
import {
  DeliveryRecipientView,
  DeliveryMessageView,
  DeliveryStatus,
  DeliveryResult,
} from "./modules/delivery-presentation"
import { DeliveryDetail } from "./modules/delivery-detail"
function DeliveryWorkbench() {
  const { t, i18n } = useTranslation(),
    session = getAuthSession(),
    p = "notificationDelivery.",
    state = useDeliveryWorkbench(),
    mobile = useAppStore((store) => store.isMobile),
    retryPermission = usePermission("notification-delivery:retry")
  const [draftId, setDraftId] = useState(""),
    [locate, setLocate] = useState(false),
    [detail, setDetail] = useState<Delivery | null>(null),
    [messageDetail, setMessageDetail] = useState<string | null>(null),
    [confirmation, setConfirmation] = useState<{ id: string } | null>(null),
    [retryError, setRetryError] = useState(false)
  const alive = useRef(true),
    epoch = useRef(0),
    lock = useRef(false),
    selectedId = useRef(state.messageId)
  selectedId.current = state.messageId
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      epoch.current++
    }
  }, [])
  useEffect(() => {
    if (!retryPermission) {
      epoch.current++
      setConfirmation(null)
      setRetryError(false)
    }
  }, [retryPermission])
  useEffect(() => {
    if (!state.canReadMessages) setMessageDetail(null)
  }, [state.canReadMessages])
  const selectMessage = (id: string) => {
    if (state.selectMessage(id)) {
      setDetail(null)
      setMessageDetail(null)
      setConfirmation(null)
      setDraftId(id)
    }
  }
  const refresh = async () => {
    setDetail(null)
    await state.refresh()
  }
  const confirmRetry = async () => {
    if (!confirmation || lock.current) return
    const id = confirmation.id,
      request = ++epoch.current
    lock.current = true
    setRetryError(false)
    try {
      requireDeliveryPermission("notification-delivery:retry", session)
      const count = await state.retry(id)
      if (!alive.current || request !== epoch.current || session !== getAuthSession() || selectedId.current !== id)
        return
      setConfirmation(null)
      toast.success(t(`${p}retried`, { count }))
    } catch {
      if (alive.current && request === epoch.current && session === getAuthSession()) setRetryError(true)
    } finally {
      lock.current = false
    }
  }
  const columns = useMemo<DataTableColumn<Delivery>[]>(
    () => [
      {
        id: "recipient",
        header: t(`${p}recipient`),
        size: 250,
        cell: ({ row }) => <DeliveryRecipientView recipient={row.original.recipient} userId={row.original.userId} />,
      },
      { id: "channel", header: t(`${p}channel`), size: 110, cell: () => t(`${p}inApp`) },
      {
        id: "status",
        header: t(`${p}deliveryStatus`),
        size: 120,
        cell: ({ row }) => <DeliveryStatus status={row.original.status} />,
      },
      { id: "attemptCount", header: t(`${p}attemptCount`), size: 100, cell: ({ row }) => row.original.attemptCount },
      {
        id: "result",
        header: t(`${p}latestResult`),
        size: 240,
        cell: ({ row }) => <DeliveryResult row={row.original} />,
      },
      {
        id: "actions",
        header: t(`${p}details`),
        size: 90,
        cell: ({ row }) => (
          <Button variant="link" size="sm" onClick={() => setDetail(row.original)}>
            {t(`${p}details`)}
          </Button>
        ),
      },
    ],
    [t],
  )
  const busy = state.loading || state.summaryLoading,
    options = state.recentMessages.map((message) => ({
      value: message.id,
      label: `${deliveryMessageTitle(message, i18n.language, (key, params) => translateText(t, key, params))} · ${deliveryTime(message.publishedAt || message.createTime)} · ${t(`announcement.statusOptions.${message.status}`)}`,
    }))
  return (
    <div className="grid min-w-0 gap-4">
      <PageHeader title={t(`${p}title`)} description={t(`${p}subtitle`)} />
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" disabled={busy || state.messagesLoading} onClick={() => void refresh()}>
          {t("datatable.refresh")}
        </Button>
        {retryPermission && (
          <Button
            disabled={!state.canRetry}
            onClick={() => {
              if (!state.canRetry || lock.current) return
              setRetryError(false)
              setConfirmation({ id: state.messageId })
            }}
          >
            {state.retrying ? t("common.loading") : t(`${p}retryFailedCount`, { count: state.failedCount })}
          </Button>
        )}
      </div>
      <section className="grid min-w-0 gap-3 rounded-lg border p-4">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          {state.canReadMessages && (
            <div className="min-w-0 flex-1 basis-60">
              <SearchableChoice
                clearable={false}
                label={t(`${p}selectMessage`)}
                value={state.recentMessages.some((message) => message.id === state.messageId) ? state.messageId : null}
                options={options}
                loading={state.messagesLoading}
                placeholder={t(`${p}selectMessagePlaceholder`)}
                onChange={(id) => {
                  if (id) selectMessage(id)
                }}
              />
            </div>
          )}
          <Button variant={state.canReadMessages ? "outline" : "default"} onClick={() => setLocate((value) => !value)}>
            {t(`${p}advancedQuery`)}
          </Button>
        </div>
        {state.messagesFailed && (
          <p role="alert" className="text-sm text-amber-700 dark:text-amber-300">
            {t(`${p}messagesFailed`)}
          </p>
        )}
        {(locate || !state.canReadMessages) && (
          <form
            className="flex flex-wrap items-start gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              const id = normalizeDeliveryMessageId(draftId)
              if (id) {
                setLocate(false)
                selectMessage(id)
              }
            }}
          >
            <div className="min-w-0 flex-1 basis-60">
              <Input
                aria-label={t(`${p}messageId`)}
                placeholder={t(`${p}messageIdPlaceholder`)}
                value={draftId}
                onChange={(event) => setDraftId(event.target.value)}
                aria-invalid={Boolean(draftId && !normalizeDeliveryMessageId(draftId))}
              />
              {draftId && !normalizeDeliveryMessageId(draftId) && (
                <p role="alert" className="mt-1 text-xs text-destructive">
                  {t(`${p}messageIdInvalid`)}
                </p>
              )}
            </div>
            <Button type="submit" disabled={!normalizeDeliveryMessageId(draftId) || busy}>
              {t("common.search")}
            </Button>
          </form>
        )}
        {state.messageId && (
          <DeliveryMessageView
            message={state.currentMessage}
            canView={state.canReadMessages}
            onView={() => setMessageDetail(state.messageId)}
          />
        )}
      </section>
      {state.messageId &&
        (state.summaryFailed ? (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500 p-4 text-sm"
          >
            <p>{t(`${p}summaryFailed`)}</p>
            <Button size="sm" variant="outline" onClick={() => void state.refresh()}>
              {t("common.retry")}
            </Button>
          </div>
        ) : (
          <section
            aria-label={t(`${p}resultTitle`)}
            aria-busy={state.summaryLoading}
            className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6"
          >
            {deliveryStates.map((status) => (
              <Button
                key={status}
                type="button"
                variant="outline"
                disabled={state.summaryLoading || !state.summary}
                aria-label={`${t(`${p}status.${status}`)}: ${state.summary ? (state.summary.byStatus?.[status] ?? 0) : "—"}`}
                aria-pressed={state.status === status}
                className={`grid h-auto min-w-0 justify-items-start gap-2 whitespace-normal px-4 py-3 ${state.status === status ? "border-primary bg-primary/5" : ""}`}
                onClick={() => state.setStatus(state.status === status ? null : status)}
              >
                <span className="text-xs text-muted-foreground">{t(`${p}status.${status}`)}</span>
                <span className="text-2xl font-semibold tabular-nums">
                  {state.summary ? (state.summary.byStatus?.[status] ?? 0) : "—"}
                </span>
              </Button>
            ))}
          </section>
        ))}
      <section className="grid min-w-0 gap-3 rounded-lg border p-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">{t(`${p}recordsTitle`)}</h2>
          <div className="flex flex-wrap items-center gap-2">
            {state.messageId && (
              <Badge variant="secondary">{t(state.status ? `${p}status.${state.status}` : `${p}allStatuses`)}</Badge>
            )}
            {state.status && (
              <Button variant="link" size="sm" onClick={() => state.setStatus(null)}>
                {t(`${p}clearFilter`)}
              </Button>
            )}
            {state.updatedAt && !state.listFailed && (
              <span className="hidden text-xs text-muted-foreground sm:block">
                {t(`${p}updatedAt`)} {deliveryTime(new Date(state.updatedAt))}
              </span>
            )}
          </div>
        </header>
        {!state.messageId ? (
          <EmptyState message={t(`${p}empty`)} />
        ) : state.listFailed ? (
          <ErrorState message={t(`${p}listFailed`)} onRetry={() => void state.refresh()} />
        ) : (
          <DataTable
            columns={columns}
            data={state.records}
            getRowId={(row) => row.id}
            pagination={{ page: state.page, pageSize: state.pageSize, total: state.total }}
            onPageChange={state.setPage}
            onPageSizeChange={state.setPageSize}
            loading={state.loading}
            emptyText={t(`${p}${state.status ? "noMatchingRecords" : "noResult"}`)}
            columnPinning={mobile ? { left: [], right: [] } : { left: [], right: ["actions"] }}
          />
        )}
      </section>
      {detail && (
        <DeliveryDetail
          key={detail.id}
          row={detail}
          canViewMessage={state.canReadMessages}
          onClose={() => setDetail(null)}
          onViewMessage={() => setMessageDetail(detail.messageId)}
          onReturn={() => {
            setDetail(null)
            state.setStatus("dead")
          }}
        />
      )}
      {messageDetail && state.canReadMessages && (
        <AnnouncementDetail id={messageDetail} onClose={() => setMessageDetail(null)} />
      )}
      <AlertDialog
        open={retryPermission && Boolean(confirmation)}
        onOpenChange={(open) => {
          if (!open) {
            if (!lock.current) epoch.current++
            setConfirmation(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t(`${p}retryTitle`)}</AlertDialogTitle>
            <AlertDialogDescription>{t(`${p}retryConfirm`, { count: state.failedCount })}</AlertDialogDescription>
          </AlertDialogHeader>
          {retryError && (
            <p role="alert" className="text-sm text-destructive">
              {t(`${p}retryError`)}
            </p>
          )}
          <AlertDialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                if (!lock.current) epoch.current++
                setConfirmation(null)
              }}
            >
              {t("common.cancel")}
            </Button>
            <Button
              disabled={state.retrying || !state.canRetry || confirmation?.id !== state.messageId}
              onClick={() => void confirmRetry()}
            >
              {state.retrying ? t("common.loading") : t(`${p}confirmRetry`)}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
export default function DeliveryPage() {
  useAuthStore((state) => state.token)
  const canRead = usePermission("notification-delivery:read")
  return canRead ? <DeliveryWorkbench key={getAuthSession()} /> : null
}
