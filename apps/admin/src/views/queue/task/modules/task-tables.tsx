import { useTranslation } from "react-i18next"
import { Button } from "@rapidkit/ui"
import { DataTable, type DataTableColumn } from "@/shared/data-table"
import type { TaskRecord, TaskGroups } from "@/services/api/task"
import { taskPageSizes } from "./task-view-state"
import { TaskStatusBadge, taskTime } from "./task-presentation"
interface TableState {
  page: number
  pageSize: number
  total: number
  loading: boolean
  error: boolean
  onPage: (page: number) => void
  onSize: (size: number) => void
  onRetry: () => void
}
export function TaskRecordsTable({
  rows,
  canRevoke,
  onDetail,
  onRevoke,
  isPending,
  ...state
}: TableState & {
  rows: TaskRecord[]
  canRevoke: boolean
  onDetail: (id: string) => void
  onRevoke: (id: string) => void
  isPending: (id: string) => boolean
}) {
  const { t, i18n } = useTranslation(),
    columns: DataTableColumn<TaskRecord>[] = [
      { id: "index", header: "#", size: 60, cell: ({ row }) => (state.page - 1) * state.pageSize + row.index + 1 },
      {
        accessorKey: "taskName",
        header: t("task.taskName"),
        size: 260,
        cell: ({ row }) => (
          <span className="block max-w-64 truncate" title={row.original.taskName}>
            {row.original.taskName}
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: t("task.taskStatus"),
        size: 110,
        cell: ({ row }) => <TaskStatusBadge status={row.original.status} />,
      },
      {
        accessorKey: "workerHostname",
        header: t("task.workerHostname"),
        size: 180,
        cell: ({ row }) => (
          <span className="block max-w-44 truncate" title={row.original.workerHostname}>
            {row.original.workerHostname || "—"}
          </span>
        ),
      },
      {
        accessorKey: "runtime",
        header: t("task.runtime"),
        size: 100,
        cell: ({ row }) => (typeof row.original.runtime === "number" ? row.original.runtime.toFixed(2) : "—"),
      },
      {
        accessorKey: "startedAt",
        header: t("task.startedAt"),
        size: 190,
        cell: ({ row }) => taskTime(row.original.startedAt, i18n.language),
      },
      { accessorKey: "retries", header: t("task.retries"), size: 85 },
      {
        id: "actions",
        header: t("task.actions"),
        size: canRevoke ? 200 : 100,
        cell: ({ row }) => (
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => onDetail(row.original.taskId)}>
              {t("task.detailAction")}
            </Button>
            {canRevoke && (row.original.status === "1" || row.original.status === "2") && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="text-destructive"
                disabled={isPending(row.original.taskId) || state.loading}
                onClick={() => onRevoke(row.original.taskId)}
              >
                {t("task.revokeTask")}
              </Button>
            )}
          </div>
        ),
      },
    ]
  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(row) => row.taskId}
      pagination={{ page: state.page, pageSize: state.pageSize, total: state.total, pageSizes: taskPageSizes }}
      onPageChange={state.onPage}
      onPageSizeChange={state.onSize}
      loading={state.loading}
      error={state.error}
      onRetry={state.onRetry}
    />
  )
}
export function TaskGroupsTable({
  rows,
  onDrill,
  ...state
}: TableState & { rows: TaskGroups["records"]; onDrill: (name: string, failure: boolean) => void }) {
  const { t, i18n } = useTranslation(),
    columns: DataTableColumn<TaskGroups["records"][number]>[] = [
      {
        accessorKey: "taskName",
        header: t("task.taskName"),
        size: 260,
        cell: ({ row }) => (
          <span className="block max-w-64 truncate" title={row.original.taskName}>
            {row.original.taskName}
          </span>
        ),
      },
      {
        id: "total",
        header: t("task.groupTotal"),
        size: 90,
        cell: ({ row }) => (
          <Button
            type="button"
            variant="link"
            size="sm"
            disabled={state.loading}
            onClick={() => onDrill(row.original.taskName, false)}
          >
            {row.original.total}
          </Button>
        ),
      },
      { accessorKey: "success", header: t("task.groupSuccess"), size: 90 },
      {
        id: "failure",
        header: t("task.groupFailure"),
        size: 90,
        cell: ({ row }) => (
          <Button
            type="button"
            variant="link"
            size="sm"
            className="text-destructive"
            disabled={state.loading}
            onClick={() => onDrill(row.original.taskName, true)}
          >
            {row.original.failure}
          </Button>
        ),
      },
      { accessorKey: "inProgress", header: t("task.groupInProgress"), size: 110 },
      {
        accessorKey: "successRate",
        header: t("task.groupSuccessRate"),
        size: 120,
        cell: ({ row }) =>
          typeof row.original.successRate === "number" ? `${row.original.successRate.toFixed(1)}%` : "—",
      },
      {
        accessorKey: "lastExecutedAt",
        header: t("task.groupLastExecuted"),
        size: 190,
        cell: ({ row }) => taskTime(row.original.lastExecutedAt, i18n.language),
      },
      {
        id: "actions",
        header: t("task.actions"),
        size: 150,
        cell: ({ row }) => (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={state.loading}
            onClick={() => onDrill(row.original.taskName, false)}
          >
            {t("task.viewRecords")}
          </Button>
        ),
      },
    ]
  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(row) => row.taskName}
      pagination={{ page: state.page, pageSize: state.pageSize, total: state.total, pageSizes: taskPageSizes }}
      onPageChange={state.onPage}
      onPageSizeChange={state.onSize}
      loading={state.loading}
      error={state.error}
      onRetry={state.onRetry}
    />
  )
}
