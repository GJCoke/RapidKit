import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { useNavigate } from "react-router"
import { useTranslation } from "react-i18next"
import type { ColumnPinningState, VisibilityState } from "@tanstack/react-table"
import { Badge, Button, Input, toast } from "@rapidkit/ui"
import { Switch } from "@rapidkit/ui/components/switch"
import { usePermission } from "@/features/auth"
import { useAuthStore } from "@/stores/auth"
import { useAppStore } from "@/stores/app"
import { getAuthSession } from "@/services/auth-session"
import { PageHeader } from "@/features/layout/components/page-header"
import type { ScheduleQuery, ScheduleRecord, ScheduleValue } from "@/services/api/schedule"
import { scheduleAccess, useSchedules, useScheduleOperations } from "@/services/hooks/use-schedules"
import { ConfirmActionDialog, FormField } from "@/shared/crud"
import { FormSelect } from "@/shared/crud/form-select"
import { DataTable, TableHeaderOperation, TableColumnSetting, type DataTableColumn } from "@/shared/data-table"
import { nextPageAfterDelete, reconcileColumnOrder } from "@/shared/data-table/table-state"
import { ScheduleOperateDrawer } from "./modules/schedule-operate-drawer"
type Filters = Pick<ScheduleQuery, "taskName" | "enabled">
function ScheduleWorkbench() {
  const { t } = useTranslation(),
    navigate = useNavigate(),
    mobile = useAppStore((state) => state.isMobile),
    session = getAuthSession(),
    canCreate = usePermission("schedule:create"),
    canUpdate = usePermission("schedule:update"),
    canDelete = usePermission("schedule:delete"),
    [draft, setDraft] = useState<Filters>({}),
    [query, setQuery] = useState<ScheduleQuery>({ page: 1, pageSize: 20 }),
    list = useSchedules(query),
    operations = useScheduleOperations(list.key),
    [editing, setEditing] = useState<{ record: ScheduleRecord | null } | null>(null),
    [confirmation, setConfirmation] = useState<string | null>(null),
    [failed, setFailed] = useState(false),
    [visibility, setVisibility] = useState<VisibilityState>({}),
    [order, setOrder] = useState(["index", "name", "task", "type", "detail", "enabled", "actions"]),
    [pinning, setPinning] = useState<ColumnPinningState>({ left: [], right: [] })
  useEffect(() => {
    if (editing && !(editing.record ? canUpdate : canCreate)) setEditing(null)
    if (!canDelete) setConfirmation(null)
  }, [editing, canCreate, canUpdate, canDelete])
  const latest = useRef({ query, draft, list })
  useLayoutEffect(() => {
    latest.current = { query, draft, list }
  })
  function request(page?: number, pageSize?: number) {
    const current = latest.current
    const next = { ...current.draft, page: page ?? current.query.page, pageSize: pageSize ?? current.query.pageSize }
    if (JSON.stringify(next) === JSON.stringify(current.query)) void current.list.refetch()
    else setQuery(next)
  }
  function detail(value: ScheduleValue) {
    if (value.type === "interval")
      return t("scheduleEditor.intervalSummary", {
        count: value.every,
        unit: t(`scheduleEditor.periods.${value.period}`),
      })
    if (value.type === "crontab")
      return `${value.minute} ${value.hour} ${value.dayOfMonth} ${value.monthOfYear} ${value.dayOfWeek}`
    return `${t(`scheduleEditor.events.${value.event}`)} · ${value.latitude}°, ${value.longitude}°`
  }
  function records(task: string) {
    void navigate(`/queue/task?${new URLSearchParams({ view: "records", task, range: "7d" })}`)
  }
  async function toggle(id: string) {
    setFailed(false)
    if (await operations.toggle(id)) {
      toast.success(t("schedule.toggleSuccess"))
      request()
    } else if (scheduleAccess("schedule:update", session)) setFailed(true)
  }
  async function remove() {
    if (!confirmation) return
    const id = confirmation,
      origin = latest.current
    setFailed(false)
    if (await operations.remove(id)) {
      setConfirmation((current) => (current === id ? null : current))
      toast.success(t("schedule.deleteSuccess"))
      request(
        latest.current.query === origin.query
          ? nextPageAfterDelete({
              page: origin.query.page ?? 1,
              remainingRecords: Math.max(0, (origin.list.data?.records.length ?? 0) - 1),
            })
          : undefined,
      )
    } else if (scheduleAccess("schedule:delete", session)) setFailed(true)
  }
  const columns: DataTableColumn<ScheduleRecord>[] = [
      {
        id: "index",
        header: t("schedule.index"),
        size: 64,
        meta: { title: t("schedule.index") },
        cell: ({ row }) => row.index + 1,
      },
      ...(["name", "task"] as const).map((key) => ({
        id: key,
        header: t(`schedule.${key}`),
        size: key === "task" ? 220 : 160,
        meta: { title: t(`schedule.${key}`), pinnable: true },
        cell: ({ row }: { row: { original: ScheduleRecord } }) => (
          <Button
            variant="link"
            className="max-w-full justify-start px-0"
            title={row.original[key]}
            onClick={() => records(row.original.task)}
          >
            <span className="truncate">{row.original[key]}</span>
          </Button>
        ),
      })),
      {
        id: "type",
        header: t("schedule.scheduleType"),
        size: 160,
        meta: { title: t("schedule.scheduleType") },
        cell: ({ row }) => <Badge variant="secondary">{t(`scheduleEditor.types.${row.original.schedule.type}`)}</Badge>,
      },
      {
        id: "detail",
        header: t("schedule.scheduleDetail"),
        size: 250,
        meta: { title: t("schedule.scheduleDetail") },
        cell: ({ row }) => <span className="break-words font-mono text-xs">{detail(row.original.schedule)}</span>,
      },
      {
        id: "enabled",
        header: t("schedule.enabled"),
        meta: { title: t("schedule.enabled") },
        cell: ({ row }) => (
          <Switch
            aria-label={`${t("schedule.enabled")}: ${row.original.name}`}
            checked={row.original.enabled}
            disabled={!canUpdate || list.isFetching || list.isError || operations.isPending(row.original.id)}
            onCheckedChange={() => void toggle(row.original.id)}
          />
        ),
      },
      ...(canUpdate || canDelete
        ? [
            {
              id: "actions",
              header: t("schedule.actions"),
              size: 180,
              meta: { title: t("schedule.actions"), hideable: false, pinnable: true },
              cell: ({ row }: { row: { original: ScheduleRecord } }) => (
                <div className="flex gap-1">
                  {canUpdate && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={list.isFetching || list.isError || operations.isPending(row.original.id)}
                      onClick={() => setEditing({ record: row.original })}
                    >
                      {t("common.edit")}
                    </Button>
                  )}
                  {canDelete && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      disabled={list.isFetching || list.isError || operations.isPending(row.original.id)}
                      onClick={() => setConfirmation(row.original.id)}
                    >
                      {t("common.delete")}
                    </Button>
                  )}
                </div>
              ),
            },
          ]
        : []),
    ],
    available = columns.map((column) => String(column.id)),
    columnOrder = reconcileColumnOrder(order, available)
  return (
    <div className="grid min-w-0 gap-4">
      <PageHeader title={t("schedule.title")} description={t("schedule.editorDescription")} />
      <form
        className="flex flex-wrap items-end gap-3 rounded-lg border p-4"
        onSubmit={(event) => {
          event.preventDefault()
          request(1)
        }}
      >
        <FormField label={t("schedule.task")} htmlFor="schedule-search-task">
          <Input
            id="schedule-search-task"
            value={draft.taskName ?? ""}
            onChange={(event) => setDraft({ ...draft, taskName: event.target.value || undefined })}
          />
        </FormField>
        <FormField label={t("schedule.enabled")}>
          <FormSelect
            label={t("schedule.enabled")}
            value={draft.enabled === undefined ? "all" : String(draft.enabled)}
            options={[
              { value: "all", label: t("schedule.allStatuses") },
              { value: "true", label: t("schedule.statuses.enable") },
              { value: "false", label: t("schedule.statuses.disable") },
            ]}
            onChange={(value) => setDraft({ ...draft, enabled: value === "all" ? undefined : value === "true" })}
          />
        </FormField>
        <Button type="submit">{t("common.search")}</Button>
        <Button type="button" variant="outline" onClick={() => setDraft({})}>
          {t("common.reset")}
        </Button>
      </form>
      <TableHeaderOperation
        leading={
          canCreate ? (
            <Button onClick={() => setEditing({ record: null })}>{t("schedule.addSchedule")}</Button>
          ) : undefined
        }
        refreshing={list.isFetching}
        onRefresh={() => request()}
        trailing={
          <TableColumnSetting
            columns={columns.map((column) => ({
              id: String(column.id),
              title: column.meta?.title ?? String(column.id),
              hideable: column.meta?.hideable,
              pinnable: column.meta?.pinnable,
            }))}
            visibility={visibility}
            order={columnOrder}
            pinning={pinning}
            onVisibilityChange={setVisibility}
            onOrderChange={setOrder}
            onPinningChange={setPinning}
          />
        }
      />
      {failed && (
        <p role="alert" className="text-sm text-destructive">
          {t("schedule.operationFailed")}
        </p>
      )}
      <DataTable<ScheduleRecord>
        columns={columns}
        data={list.isError ? [] : (list.data?.records ?? [])}
        getRowId={(row) => row.id}
        pagination={{
          page: query.page ?? 1,
          pageSize: query.pageSize ?? 20,
          total: list.data?.total ?? 0,
          pageSizes: [20, 50, 100, 500],
        }}
        onPageChange={(page) => request(page)}
        onPageSizeChange={(size) => request(1, size)}
        loading={list.isFetching}
        error={list.isError}
        onRetry={() => request()}
        columnVisibility={visibility}
        columnOrder={columnOrder}
        columnPinning={mobile ? { left: [], right: [] } : pinning}
      />
      {editing && (editing.record ? canUpdate : canCreate) && (
        <ScheduleOperateDrawer
          record={editing.record}
          onClose={() => setEditing(null)}
          onSubmitted={() => request(1)}
        />
      )}
      <ConfirmActionDialog
        open={canDelete && Boolean(confirmation)}
        onOpenChange={(open) => {
          if (!open) setConfirmation(null)
        }}
        title={t("schedule.deleteTitle")}
        description={t("schedule.deleteConfirm")}
        pending={Boolean(confirmation && operations.isPending(confirmation))}
        onConfirm={() => void remove()}
        confirmLabel={t("common.delete")}
      />
    </div>
  )
}
export default function ScheduleManagementPage() {
  useAuthStore((state) => state.token)
  const read = usePermission("schedule:read"),
    { t } = useTranslation()
  return read ? <ScheduleWorkbench key={getAuthSession()} /> : <p role="alert">{t("error.403")}</p>
}
