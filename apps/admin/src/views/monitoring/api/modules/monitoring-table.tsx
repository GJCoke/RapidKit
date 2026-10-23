import { createContext, useContext } from "react"
import { useTranslation } from "react-i18next"
import type { HeaderContext } from "@tanstack/react-table"
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react"
import { Badge, Button } from "@rapidkit/ui"
import type { ApiMetric } from "@/services/api/api-monitoring"
import { DataTable, type DataTableColumn } from "@/shared/data-table"
import { monitoringSortFields, type MonitoringSort, type MonitoringSortField } from "./monitoring-model"
interface Sorting {
  sort: MonitoringSort
  onSort: (field: MonitoringSortField) => void
}
const SortContext = createContext<Sorting | null>(null)
function isSortField(value: string): value is MonitoringSortField {
  return Object.hasOwn(monitoringSortFields, value)
}
function MonitoringSortHeader({ column }: HeaderContext<ApiMetric, unknown>) {
  const context = useContext(SortContext),
    { t } = useTranslation(),
    field = column.id
  if (!context || !isSortField(field)) return null
  const { sort, onSort } = context,
    active = sort?.field === field,
    Icon = active ? (sort.order === "desc" ? ArrowDown : ArrowUp) : ArrowUpDown
  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-2 px-2"
      aria-pressed={active}
      aria-label={`${t(`apiMonitoring.${field}`)} · ${t(active ? `apiMonitoring.sort.${sort.order}` : "apiMonitoring.sort.none")}`}
      title={t("apiMonitoring.sortHint")}
      onClick={() => onSort(field)}
    >
      {t(`apiMonitoring.${field}`)}
      <Icon className="size-3" />
    </Button>
  )
}
interface Props extends Sorting {
  records: ApiMetric[]
  total: number
  page: number
  pageSize: number
  loading: boolean
  failed: boolean
  onRetry: () => void
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
}
export function ApiMonitoringTable({
  records,
  total,
  page,
  pageSize,
  loading,
  failed,
  onRetry,
  onPageChange,
  onPageSizeChange,
  sort,
  onSort,
}: Props) {
  const { t } = useTranslation()
  const columns: DataTableColumn<ApiMetric>[] = [
    {
      id: "method",
      header: t("apiMonitoring.method"),
      size: 95,
      cell: ({ row }) => (
        <Badge
          variant="outline"
          className={
            row.original.method === "GET"
              ? "text-emerald-700 dark:text-emerald-300"
              : row.original.method === "DELETE"
                ? "text-destructive"
                : row.original.method === "PUT"
                  ? "text-amber-700 dark:text-amber-300"
                  : "text-primary"
          }
        >
          {row.original.method}
        </Badge>
      ),
    },
    {
      id: "path",
      header: t("apiMonitoring.path"),
      size: 280,
      cell: ({ row }) => (
        <code className="block max-w-70 truncate text-xs" title={row.original.path}>
          {row.original.path}
        </code>
      ),
    },
    ...Object.keys(monitoringSortFields)
      .filter(isSortField)
      .map((field) => ({
        id: field,
        size: 155,
        header: MonitoringSortHeader,
        cell: ({ row }: { row: { original: ApiMetric } }) => {
          const value = row.original[field],
            warning =
              field === "errorRate"
                ? value >= 5
                  ? "text-destructive"
                  : value >= 1
                    ? "text-amber-700 dark:text-amber-300"
                    : ""
                : field === "p95Ms"
                  ? value >= 3000
                    ? "text-destructive"
                    : value >= 1000
                      ? "text-amber-700 dark:text-amber-300"
                      : ""
                  : field === "errorCount" && value > 0
                    ? "font-semibold text-destructive"
                    : ""
          return (
            <span className={`tabular-nums ${warning}`}>
              {field === "requestCount"
                ? value.toLocaleString()
                : field === "errorRate"
                  ? `${value}%`
                  : field === "avgMs" || field === "p95Ms"
                    ? `${value} ms`
                    : value}
            </span>
          )
        },
      })),
  ]
  return (
    <SortContext.Provider value={{ sort, onSort }}>
      <DataTable<ApiMetric>
        columns={columns}
        data={failed ? [] : records}
        getRowId={(row) => `${row.method}:${row.path}`}
        pagination={{ page, pageSize, total, pageSizes: [20, 50, 100, 500] }}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
        loading={loading}
        error={failed}
        onRetry={onRetry}
      />
    </SortContext.Provider>
  )
}
