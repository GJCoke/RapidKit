import { parseApiDate } from "@/shared/date-time"
import { useCallback, useEffect, useRef, useState } from "react"
import dayjs from "dayjs"
import { z } from "zod"
import { useTranslation } from "react-i18next"
import { useQueryClient } from "@tanstack/react-query"
import type { ColumnPinningState, VisibilityState } from "@tanstack/react-table"
import { Button, Input, toast } from "@rapidkit/ui"
import { Can, usePermission } from "@/features/auth"
import { hasPermission } from "@/features/auth/permissions"
import { useAuthStore } from "@/stores/auth"
import { useAppStore } from "@/stores/app"
import { getAuthSession } from "@/services/auth-session"
import type { PermissionCode } from "@/typings/permission-codes"
import type { Announcement, AnnouncementQuery } from "@/services/api/announcement"
import {
  useAnnouncements,
  useAnnouncementBannerSummary,
  useAnnouncementWrites,
} from "@/services/hooks/use-announcements"
import { notificationKeys } from "@/services/hooks/use-notifications"
import { PageHeader } from "@/features/layout/components/page-header"
import { LoadingState } from "@/features/layout/components/states"
import { renderNotification } from "@/features/notifications/notification-model"
import { ConfirmActionDialog, FormField } from "@/shared/crud"
import { DataTable, TableColumnSetting, TableHeaderOperation } from "@/shared/data-table"
import { AnnouncementSelect } from "./modules/announcement-select"
import { AnnouncementOperateDrawer } from "./modules/announcement-operate-drawer"
import { AnnouncementDetail } from "./modules/announcement-detail"
import { BannerSummary } from "./modules/banner-summary"
import { announcementActions, type AnnouncementRowAction } from "./modules/announcement-model"
import { announcementActionText } from "./modules/announcement-presentation"
import { useAnnouncementColumns } from "./announcement-columns"
const statuses = z.enum([
  "draft",
  "scheduled",
  "publishing",
  "published",
  "expired",
  "cancelled",
  "recalled",
  "superseded",
])
type Filters = Omit<AnnouncementQuery, "page" | "pageSize">
type Transition = "delete" | "cancel" | "recall"
type PendingAction = { id: string; action: Transition; source: "list" | "current" | "scheduled" }
function AnnouncementWorkbench() {
  const { t, i18n } = useTranslation(),
    session = getAuthSession(),
    client = useQueryClient()
  const token = useAuthStore((state) => state.token),
    info = useAuthStore((state) => state.userInfo),
    mobile = useAppStore((state) => state.isMobile)
  const can = useCallback((code: PermissionCode) => Boolean(token) && hasPermission(info, code), [token, info])
  const canPreview = usePermission("notification:preview")
  const [draft, setDraft] = useState<Filters>({}),
    [filters, setFilters] = useState<Filters>({})
  const [visibility, setVisibility] = useState<VisibilityState>({}),
    [order, setOrder] = useState(["information", "displayMode", "level", "status", "time", "actions"]),
    [pinning, setPinning] = useState<ColumnPinningState>({ left: [], right: ["actions"] })
  const [editing, setEditing] = useState<{ id?: string; copy?: string } | null>(null),
    [detailId, setDetailId] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingAction | null>(null),
    [busy, setBusy] = useState<ReadonlySet<string>>(new Set())
  const locks = useRef(new Set<string>())
  const table = useAnnouncements(filters),
    banners = useAnnouncementBannerSummary(),
    writes = useAnnouncementWrites()
  const freshCan = useCallback(
    (code: PermissionCode) =>
      session === getAuthSession() &&
      Boolean(useAuthStore.getState().token) &&
      hasPermission(useAuthStore.getState().userInfo, code),
    [session],
  )
  const onAction = useCallback(
    (row: Announcement, action: AnnouncementRowAction) => {
      if (
        locks.current.has(row.id) ||
        !freshCan("notification:read") ||
        !announcementActions(row, freshCan).includes(action)
      )
        return
      if (action === "detail") setDetailId(row.id)
      else if (action === "edit" || action === "publish") setEditing({ id: row.id })
      else if (action === "copy") setEditing({ copy: row.id })
      else setPending({ id: row.id, action, source: "list" })
    },
    [freshCan],
  )
  const columns = useAnnouncementColumns({ can, busy, onAction })
  const pendingBanner = pending && pending.source !== "list" ? banners.data?.[pending.source] : null
  const pendingRow =
    pending?.source === "list"
      ? table.tableData.records.find((row) => row.id === pending.id)
      : pending && canPreview && pendingBanner?.id === pending.id
        ? { ...pendingBanner, displayMode: "top_banner" }
        : null
  useEffect(() => {
    if (pending && (!pendingRow || !announcementActions(pendingRow, can).includes(pending.action))) setPending(null)
  }, [pending, pendingRow, can])
  const apply = (next: Filters) => {
    setFilters(next)
    table.resetPage()
  }
  const refreshAll = async () => {
    const bannerKey = [...notificationKeys.root(session), "banner"]
    await Promise.all([
      table.refresh(),
      ...(canPreview ? [banners.refetch()] : []),
      client.cancelQueries({ queryKey: bannerKey }).then(() => {
        if (session === getAuthSession()) return client.invalidateQueries({ queryKey: bannerKey })
      }),
    ])
  }
  const run = async () => {
    if (!pending || locks.current.has(pending.id)) return
    const latest = pending.source === "list" ? table.getRow(pending.id) : banners.data?.[pending.source]
    if (!latest || latest.id !== pending.id || !announcementActions(latest, freshCan).includes(pending.action)) {
      setPending(null)
      return
    }
    const operation = pending
    locks.current.add(operation.id)
    setBusy(new Set(locks.current))
    try {
      await writes.transition.mutateAsync({ id: operation.id, action: operation.action })
      if (session !== getAuthSession()) return
      toast.success(t("announcement.operationSucceeded"))
      setPending(null)
      if (operation.action === "delete") table.pageAfterDelete(Math.max(0, table.tableData.records.length - 1))
    } catch {
      if (session === getAuthSession()) toast.error(t("announcement.operationFailed"))
    } finally {
      locks.current.delete(operation.id)
      setBusy(new Set(locks.current))
    }
  }
  const warning = () => {
    if (!pending || !pendingRow) return ""
    if (pending.action === "recall") {
      if (pendingRow.displayMode !== "top_banner") return t("announcement.table.recallWarning")
      const planned = banners.data?.scheduled
      const title = planned
        ? renderNotification(planned, i18n.language, (key, params) => t(key, params ?? {})).title
        : ""
      return `${t("announcement.banner.takeDownWarning")}${planned ? ` ${t("announcement.banner.takeDownUpcoming")} ${title} · ${dayjs(parseApiDate(planned.publishAt ?? "")).format("YYYY-MM-DD HH:mm")}` : ""}`
    }
    if (pending.action === "delete")
      return t(`announcement.table.${pendingRow.status === "draft" ? "deleteDraftWarning" : "deletePlanWarning"}`)
    return t(
      `announcement.${pendingRow.displayMode === "top_banner" && pendingRow.status === "scheduled" ? "banner.cancelWarning" : `table.${pendingRow.status === "draft" ? "cancelDraftWarning" : "cancelPlanWarning"}`}`,
    )
  }
  return (
    <div className="grid min-w-0 gap-4">
      <PageHeader title={t("announcement.pageTitle")} description={t("announcement.description")} />
      <form
        className="flex flex-wrap items-end gap-3 rounded-lg border p-4"
        onSubmit={(event) => {
          event.preventDefault()
          apply(draft)
        }}
      >
        <FormField label={t("announcement.category")} htmlFor="announcement-category-filter">
          <Input
            id="announcement-category-filter"
            value={draft.category ?? ""}
            onChange={(event) => setDraft({ ...draft, category: event.target.value || undefined })}
          />
        </FormField>
        <FormField label={t("announcement.status")}>
          <AnnouncementSelect
            label={t("announcement.status")}
            value={draft.status ?? "all"}
            options={[
              { value: "all", label: t("announcement.all") },
              ...statuses.options.map((value) => ({ value, label: t(`announcement.statusOptions.${value}`) })),
            ]}
            onChange={(value) => {
              const parsed = statuses.safeParse(value)
              setDraft({ ...draft, status: parsed.success ? parsed.data : undefined })
            }}
          />
        </FormField>
        <FormField label={t("announcement.banner.displayMode")}>
          <AnnouncementSelect
            label={t("announcement.banner.displayMode")}
            value={draft.displayMode ?? "all"}
            options={[
              { value: "all", label: t("announcement.all") },
              { value: "inbox", label: t("announcement.editor.inApp") },
              { value: "top_banner", label: t("announcement.banner.topBanner") },
            ]}
            onChange={(value) =>
              setDraft({ ...draft, displayMode: value === "inbox" || value === "top_banner" ? value : undefined })
            }
          />
        </FormField>
        <Button type="submit">{t("common.search")}</Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setDraft({})
            apply({})
          }}
        >
          {t("common.reset")}
        </Button>
      </form>
      {canPreview && (
        <section className="grid min-w-0 gap-3 rounded-lg border p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">{t("announcement.banner.topBanner")}</h2>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={banners.isFetching}
              onClick={() => void banners.refetch()}
            >
              {t("announcement.banner.refresh")}
            </Button>
          </div>
          {banners.isPending && <LoadingState label={t("common.loading")} />}
          {banners.isError && (
            <p role="alert" className="text-sm text-destructive">
              {t("announcement.banner.summaryFailed")}
            </p>
          )}
          {banners.data && (
            <BannerSummary
              check={banners.data}
              actions={(kind, item) => (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (freshCan("notification:read")) setDetailId(item.id)
                    }}
                  >
                    {t("announcement.banner.viewDetails")}
                  </Button>
                  {kind === "scheduled" && can("notification:update") && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (freshCan("notification:update")) setEditing({ id: item.id })
                      }}
                    >
                      {t("common.edit")}
                    </Button>
                  )}
                  {can(kind === "current" ? "notification:recall" : "notification:cancel") && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy.has(item.id)}
                      onClick={() =>
                        setPending({ id: item.id, action: kind === "current" ? "recall" : "cancel", source: kind })
                      }
                    >
                      {t(`announcement.banner.${kind === "current" ? "takeDown" : "cancelPlan"}`)}
                    </Button>
                  )}
                </>
              )}
            />
          )}
        </section>
      )}
      <TableHeaderOperation
        leading={
          <Can permission="notification:create">
            <Button
              onClick={() => {
                if (freshCan("notification:create")) setEditing({})
              }}
            >
              {t("announcement.add")}
            </Button>
          </Can>
        }
        refreshing={table.query.isFetching}
        onRefresh={() => void refreshAll()}
        trailing={
          <TableColumnSetting
            columns={columns.map((column) => ({
              id: String(column.id),
              title: column.meta?.title ?? String(column.id),
              hideable: column.meta?.hideable,
              pinnable: column.meta?.pinnable,
            }))}
            visibility={visibility}
            order={order}
            pinning={pinning}
            onVisibilityChange={setVisibility}
            onOrderChange={setOrder}
            onPinningChange={setPinning}
          />
        }
      />
      <DataTable<Announcement>
        columns={columns}
        data={table.tableData.records}
        getRowId={(row) => row.id}
        loading={table.query.isPending || table.query.isPlaceholderData}
        error={table.query.isError}
        onRetry={() => void table.refresh()}
        pagination={{ page: table.page, pageSize: table.pageSize, total: table.tableData.total }}
        onPageChange={table.setPage}
        onPageSizeChange={table.setPageSize}
        columnVisibility={visibility}
        columnOrder={order}
        columnPinning={mobile ? { left: [], right: [] } : pinning}
      />
      {editing && (
        <AnnouncementOperateDrawer
          key={`${session}:${editing.id ?? "new"}:${editing.copy ?? ""}`}
          messageId={editing.id}
          copyFromId={editing.copy}
          onClose={() => setEditing(null)}
        />
      )}
      {detailId && (
        <AnnouncementDetail key={`${session}:${detailId}`} id={detailId} onClose={() => setDetailId(null)} />
      )}
      <ConfirmActionDialog
        open={Boolean(pending && pendingRow)}
        onOpenChange={(open) => {
          if (!open && (!pending || !busy.has(pending.id))) setPending(null)
        }}
        title={
          pending && pendingRow
            ? announcementActionText(pendingRow, pending.action, (key) => t(key))
            : t("common.confirm")
        }
        description={warning()}
        pending={Boolean(pending && busy.has(pending.id))}
        onConfirm={() => void run()}
        confirmLabel={
          pending && pendingRow
            ? announcementActionText(pendingRow, pending.action, (key) => t(key))
            : t("common.confirm")
        }
      />
    </div>
  )
}
export default function AnnouncementPage() {
  const token = useAuthStore((state) => state.token)
  return token ? <AnnouncementWorkbench key={getAuthSession()} /> : null
}
