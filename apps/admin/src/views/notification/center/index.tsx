import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Button, Checkbox, Input } from "@rapidkit/ui"
import { useAuthStore } from "@/stores/auth"
import { getAuthSession } from "@/services/auth-session"
import type { NotificationQuery } from "@/services/api/notification"
import { useNotificationInbox, useNotificationUnread } from "@/services/hooks/use-notifications"
import { PageHeader } from "@/features/layout/components/page-header"
import { EmptyState, ErrorState, LoadingState } from "@/features/layout/components/states"
import { NotificationItem } from "@/features/notifications/notification-item"
import { useNotificationOperations } from "@/features/notifications/use-notification-operations"
import { FormField, ConfirmActionDialog } from "@/shared/crud"

function NotificationCenterContent() {
  const { t } = useTranslation()
  const [filters, setFilters] = useState<NotificationQuery>({ archived: "active" })
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const inbox = useNotificationInbox(filters),
    unread = useNotificationUnread()
  const operations = useNotificationOperations()
  const busy = operations.mutation.isPending
  const selectClass = "h-8 w-full rounded-md border bg-background px-2 text-sm"
  return (
    <div className="grid min-w-0 gap-4">
      <PageHeader title={t("notification.title")} description={t("notification.description")} />
      <section className="grid gap-4 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={Boolean(filters.unreadOnly)}
              onCheckedChange={(value) =>
                setFilters((previous) => ({ ...previous, unreadOnly: value === true || undefined }))
              }
            />
            {t("notification.filters.unreadOnly")}
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={busy || !unread.data?.count}
              onClick={() => void operations.perform({ type: "read-all" })}
            >
              {t("notification.readAll")}
            </Button>
            <Button variant="outline" disabled={inbox.isFetching} onClick={() => void inbox.refetch()}>
              {t("notification.refresh")}
            </Button>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <FormField label={t("notification.archiveState")} htmlFor="notification-archived">
            <select
              id="notification-archived"
              className={selectClass}
              value={filters.archived}
              onChange={(event) => {
                const value = event.target.value
                if (value === "active" || value === "archived" || value === "all")
                  setFilters((previous) => ({ ...previous, archived: value }))
              }}
            >
              {["active", "archived", "all"].map((value) => (
                <option key={value} value={value}>
                  {t(`notification.filters.${value}`)}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label={t("notification.filters.level")} htmlFor="notification-level">
            <select
              id="notification-level"
              className={selectClass}
              value={filters.level ?? ""}
              onChange={(event) => {
                const value = event.target.value
                if (value === "" || value === "info" || value === "success" || value === "warning" || value === "error")
                  setFilters((previous) => ({ ...previous, level: value || undefined }))
              }}
            >
              <option value="">{t("notification.tabs.all")}</option>
              {["info", "success", "warning", "error"].map((level) => (
                <option key={level} value={level}>
                  {t(`notification.level.${level}`)}
                </option>
              ))}
            </select>
          </FormField>
          {(["category", "createdFrom", "createdTo"] as const).map((key) => (
            <FormField key={key} label={t(`notification.filters.${key}`)} htmlFor={`notification-${key}`}>
              <Input
                id={`notification-${key}`}
                defaultValue={filters[key] ?? ""}
                onBlur={(event) => {
                  const value = event.target.value
                  setFilters((previous) => ({ ...previous, [key]: value || undefined }))
                }}
              />
            </FormField>
          ))}
        </div>
      </section>
      <section aria-label={t("notification.listTitle")} className="grid min-w-0 gap-3">
        {inbox.isPending ? (
          <LoadingState label={t("common.loading")} />
        ) : inbox.isError && !inbox.items.length ? (
          <ErrorState message={t("notification.loadFailed")} onRetry={() => void inbox.refetch()} />
        ) : !inbox.items.length ? (
          <EmptyState message={t("notification.empty")} />
        ) : (
          inbox.items.map((message) => (
            <NotificationItem
              key={message.id}
              message={message}
              busy={busy}
              onRead={(item, follow) => void operations.read(item, follow)}
              onArchive={(id) => void operations.perform({ type: "archive", id })}
              onDelete={setDeleteId}
            />
          ))
        )}
        {inbox.isFetchNextPageError && (
          <ErrorState message={t("notification.loadFailed")} onRetry={() => void inbox.fetchNextPage()} />
        )}
        {inbox.hasNextPage ? (
          <Button variant="outline" disabled={inbox.isFetching} onClick={() => void inbox.fetchNextPage()}>
            {inbox.isFetching ? t("common.loading") : t("notification.loadMore")}
          </Button>
        ) : (
          !!inbox.items.length && (
            <p className="py-3 text-center text-xs text-muted-foreground">{t("notification.noMore")}</p>
          )
        )}
      </section>
      <ConfirmActionDialog
        open={Boolean(deleteId)}
        onOpenChange={(open) => {
          if (!open && !busy) setDeleteId(null)
        }}
        title={t("notification.confirmDelete")}
        description={t("notification.confirmDeleteHint")}
        pending={busy}
        onConfirm={() => {
          if (deleteId)
            void operations.perform({ type: "delete", id: deleteId }).then((ok) => {
              if (ok) setDeleteId(null)
            })
        }}
      />
    </div>
  )
}
export default function NotificationCenter() {
  const token = useAuthStore((state) => state.token)
  return token ? <NotificationCenterContent key={getAuthSession()} /> : null
}
