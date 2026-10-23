import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import type { ColumnPinningState, VisibilityState } from "@tanstack/react-table"
import {
  Badge,
  Button,
  Input,
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  toast,
} from "@rapidkit/ui"
import { usePermission } from "@/features/auth"
import { useAuthStore } from "@/stores/auth"
import { useAppStore } from "@/stores/app"
import { getAuthSession } from "@/services/auth-session"
import type { NotificationTemplate, NotificationTemplateQuery } from "@/services/api/notification-template"
import {
  useNotificationTemplates,
  useNotificationTemplateWrites,
  requireTemplatePermission,
} from "@/services/hooks/use-notification-templates"
import { PageHeader } from "@/features/layout/components/page-header"
import { FormField } from "@/shared/crud"
import { FormSelect } from "@/shared/crud/form-select"
import { DataTable, TableHeaderOperation, TableColumnSetting, type DataTableColumn } from "@/shared/data-table"
import { TemplateOperateDrawer } from "./modules/template-operate-drawer"
import { TemplateDetailPanel } from "./modules/template-detail-panel"
type Filters = Omit<NotificationTemplateQuery, "page" | "pageSize">
function TemplateWorkbench() {
  const { t } = useTranslation(),
    session = getAuthSession(),
    mobile = useAppStore((state) => state.isMobile),
    canCreate = usePermission("notification-template:create"),
    canUpdate = usePermission("notification-template:update"),
    canDelete = usePermission("notification-template:delete")
  const [draft, setDraft] = useState<Filters>({}),
    [filters, setFilters] = useState<Filters>({}),
    [selectedId, setSelectedId] = useState<string | null>(null),
    [editing, setEditing] = useState<{ template: NotificationTemplate | null } | null>(null),
    [deleteId, setDeleteId] = useState<string | null>(null),
    [deleteError, setDeleteError] = useState(false),
    lock = useRef(false)
  const [visibility, setVisibility] = useState<VisibilityState>({}),
    [order, setOrder] = useState(["name", "categoryLevel", "mode", "status"]),
    [pinning, setPinning] = useState<ColumnPinningState>({ left: [], right: [] }),
    table = useNotificationTemplates(filters),
    { deletion } = useNotificationTemplateWrites(),
    rows = table.query.isError ? [] : table.tableData.records,
    selected = rows.find((row) => row.id === selectedId) ?? rows[0] ?? null,
    pendingRow = rows.find((row) => row.id === deleteId)
  useEffect(() => {
    if (!table.query.isPlaceholderData && !rows.some((row) => row.id === selectedId)) setSelectedId(rows[0]?.id ?? null)
  }, [rows, selectedId, table.query.isPlaceholderData])
  useEffect(() => {
    if (editing && !(editing.template ? canUpdate : canCreate)) setEditing(null)
    if (deleteId && (!canDelete || (!pendingRow && !table.query.isFetching))) setDeleteId(null)
  }, [editing, canUpdate, canCreate, deleteId, canDelete, pendingRow, table.query.isFetching])
  const apply = (value: Filters) => {
    setFilters(value)
    setSelectedId(null)
    table.resetPage()
  }
  const columns = useMemo<DataTableColumn<NotificationTemplate>[]>(() => {
    const categoryLabel = (category: string) => {
      const key = category.replace(/\.([a-z])/g, (_, char: string) => char.toUpperCase())
      return t(`notification.category.${key}`, { defaultValue: category })
    }
    return [
      {
        id: "name",
        header: t("notificationTemplate.list.name"),
        size: 220,
        meta: { title: t("notificationTemplate.list.name"), pinnable: true },
        cell: ({ row }) => (
          <div className="grid gap-1">
            <Button
              variant="link"
              className="h-auto justify-start whitespace-normal p-0 text-left"
              aria-label={t("notificationTemplate.list.select", { name: row.original.name })}
              onClick={() => setSelectedId(row.original.id)}
            >
              {row.original.name}
            </Button>
            <span className="break-all font-mono text-xs text-muted-foreground">{row.original.code}</span>
          </div>
        ),
      },
      {
        id: "categoryLevel",
        header: t("notificationTemplate.list.categoryLevel"),
        size: 200,
        meta: { title: t("notificationTemplate.list.categoryLevel") },
        cell: ({ row }) => (
          <div className="grid gap-1 text-xs">
            <span className="break-words">{categoryLabel(row.original.category)}</span>
            <span>{t(`notification.level.${row.original.level}`)}</span>
          </div>
        ),
      },
      {
        id: "mode",
        header: t("notificationTemplate.mode"),
        size: 140,
        meta: { title: t("notificationTemplate.mode") },
        cell: ({ row }) =>
          t(`notificationTemplate.list.${row.original.contentMode === "raw" ? "rawMode" : "i18nMode"}`),
      },
      {
        id: "status",
        header: t("notificationTemplate.list.status"),
        size: 120,
        meta: { title: t("notificationTemplate.list.status") },
        cell: ({ row }) => (
          <Badge variant={row.original.enabled ? "default" : "secondary"}>
            {t(`notificationTemplate.list.${row.original.enabled ? "enabled" : "disabled"}`)}
          </Badge>
        ),
      },
    ]
  }, [t])
  const remove = async () => {
    if (lock.current || !deleteId) return
    lock.current = true
    setDeleteError(false)
    try {
      requireTemplatePermission("notification-template:delete", session)
      const row = table.getRow(deleteId)
      if (!row) throw new Error("Template unavailable")
      await deletion.mutateAsync(row.id)
      if (session !== getAuthSession()) return
      setDeleteId(null)
      table.pageAfterDelete(Math.max(0, rows.length - 1))
      toast.success(t("common.success"))
    } catch {
      if (session === getAuthSession()) setDeleteError(true)
    } finally {
      lock.current = false
    }
  }
  return (
    <div className="grid min-w-0 gap-4">
      <PageHeader title={t("notificationTemplate.title")} description={t("notificationTemplate.list.intro")} />
      <form
        aria-label={t("notificationTemplate.list.searchLabel")}
        className="flex flex-wrap items-end gap-3 rounded-lg border p-4"
        onSubmit={(event) => {
          event.preventDefault()
          apply(draft)
        }}
      >
        <FormField label={t("notificationTemplate.keyword")} htmlFor="template-keyword">
          <Input
            id="template-keyword"
            placeholder={t("notificationTemplate.keywordPlaceholder")}
            value={draft.keyword ?? ""}
            onChange={(event) => setDraft({ ...draft, keyword: event.target.value })}
          />
        </FormField>
        <FormField label={t("notificationTemplate.list.enabledFilter")}>
          <FormSelect
            label={t("notificationTemplate.list.enabledFilter")}
            value={draft.enabled === undefined ? "all" : String(draft.enabled)}
            options={[
              { value: "all", label: t("notificationTemplate.list.allStatuses") },
              { value: "true", label: t("notificationTemplate.list.enabled") },
              { value: "false", label: t("notificationTemplate.list.disabled") },
            ]}
            onChange={(value) => setDraft({ ...draft, enabled: value === "all" ? undefined : value === "true" })}
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
      <div className="grid min-w-0 items-start gap-5 min-[1200px]:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 gap-4">
          <TableHeaderOperation
            leading={
              canCreate && (
                <Button onClick={() => setEditing({ template: null })}>{t("notificationTemplate.add")}</Button>
              )
            }
            refreshing={table.query.isFetching}
            onRefresh={() => void table.refresh()}
            trailing={
              <TableColumnSetting
                columns={columns.map((column) => ({
                  id: String(column.id),
                  title: column.meta?.title ?? String(column.id),
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
          <DataTable
            columns={columns}
            data={rows}
            getRowId={(row) => row.id}
            pagination={{ page: table.page, pageSize: table.pageSize, total: table.tableData.total }}
            onPageChange={(page) => {
              setSelectedId(null)
              table.setPage(page)
            }}
            onPageSizeChange={(size) => {
              setSelectedId(null)
              table.setPageSize(size)
            }}
            loading={table.query.isLoading || table.query.isPlaceholderData}
            error={table.query.isError}
            onRetry={() => void table.refresh()}
            onRowActivate={(row) => setSelectedId(row.id)}
            rowSelection={selected ? { [selected.id]: true } : {}}
            columnVisibility={visibility}
            columnOrder={order}
            columnPinning={mobile ? { left: [], right: [] } : pinning}
          />
        </div>
        <TemplateDetailPanel
          template={selected}
          canEdit={canUpdate}
          canDelete={canDelete}
          deleting={deletion.isPending}
          onEdit={() => {
            if (selected) setEditing({ template: table.getRow(selected.id) ?? selected })
          }}
          onDelete={() => {
            if (selected && !lock.current) {
              setDeleteError(false)
              setDeleteId(selected.id)
            }
          }}
        />
      </div>
      {editing && (editing.template ? canUpdate : canCreate) && (
        <TemplateOperateDrawer template={editing.template} onClose={() => setEditing(null)} />
      )}
      <AlertDialog
        open={canDelete && Boolean(pendingRow)}
        onOpenChange={(open) => {
          if (!open && !lock.current) setDeleteId(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("notificationTemplate.list.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("notificationTemplate.list.deleteContent", {
                name: pendingRow?.name ?? "",
                code: pendingRow?.code ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && (
            <p role="alert" className="text-sm text-destructive">
              {t("notificationTemplate.list.deleteFailed")}
            </p>
          )}
          <AlertDialogFooter>
            <Button variant="outline" disabled={deletion.isPending} onClick={() => setDeleteId(null)}>
              {t("common.cancel")}
            </Button>
            <Button variant="destructive" disabled={deletion.isPending} onClick={() => void remove()}>
              {deletion.isPending ? t("common.loading") : t("common.delete")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
export default function TemplatePage() {
  useAuthStore((state) => state.token)
  const canRead = usePermission("notification-template:read")
  return canRead ? <TemplateWorkbench key={getAuthSession()} /> : null
}
