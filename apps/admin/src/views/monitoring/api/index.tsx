import { useState } from "react"
import { useTranslation } from "react-i18next"
import { RefreshCw } from "lucide-react"
import { Button, Input } from "@rapidkit/ui"
import { usePermission } from "@/features/auth"
import { useAuthStore } from "@/stores/auth"
import { getAuthSession } from "@/services/auth-session"
import { useApiMonitoring } from "@/services/hooks/use-api-monitoring"
import { PageHeader } from "@/features/layout/components/page-header"
import { FormField } from "@/shared/crud"
import { FormSelect } from "@/shared/crud/form-select"
import { ApiMonitoringTable } from "./modules/monitoring-table"
import {
  monitoringRanges,
  monitoringMethods,
  nextApiSort,
  monitoringListQuery,
  type MonitoringRange,
  type MonitoringMethod,
  type MonitoringSort,
  type MonitoringSortField,
} from "./modules/monitoring-model"
import {
  MonitoringState,
  MonitoringFigure,
  MonitoringDistribution,
  MonitoringTrend,
  MonitoringRanking,
} from "./modules/monitoring-charts"
interface Filters {
  keyword: string
  method: MonitoringMethod | null
}
function ApiMonitoringWorkbench() {
  const { t } = useTranslation(),
    [range, setRange] = useState<MonitoringRange>("24h"),
    [draft, setDraft] = useState<Filters>({ keyword: "", method: null }),
    [filters, setFilters] = useState<Filters>({ keyword: "", method: null }),
    [page, setPage] = useState(1),
    [pageSize, setPageSize] = useState(20),
    [sort, setSort] = useState<MonitoringSort>(null),
    query = monitoringListQuery({ range, page, pageSize, keyword: filters.keyword, sort }),
    monitoring = useApiMonitoring(range, query, filters.method),
    q = monitoring.queries
  function apply(values: Filters) {
    if (page === 1 && JSON.stringify(values) === JSON.stringify(filters)) void q.list.refetch()
    else {
      setPage(1)
      setFilters({ ...values })
    }
  }
  function changeSort(field: MonitoringSortField) {
    const next = nextApiSort(sort, field)
    const params = monitoringListQuery({ range, page, pageSize, keyword: filters.keyword, sort: next })
    if (params.sortBy === query.sortBy && params.sortOrder === query.sortOrder) void q.list.refetch()
    setSort(next)
  }
  function changeRange(next: MonitoringRange) {
    if (next === range) void monitoring.refresh(page === 1 || Boolean(filters.method))
    setRange(next)
    setPage(1)
  }
  const summaries = [
    { key: "totalRequests", value: monitoring.overview?.totalRequests.toLocaleString() },
    { key: "totalErrors", value: monitoring.overview?.totalErrors.toLocaleString() },
    { key: "avgErrorRate", value: `${monitoring.overview?.avgErrorRate ?? 0}%` },
    { key: "avgResponseTime", value: `${monitoring.overview?.avgMs ?? 0} ms` },
  ]
  return (
    <div className="grid min-w-0 gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageHeader title={t("apiMonitoring.title")} description={t("apiMonitoring.description")} />
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label={t("apiMonitoring.timeRange")} className="flex flex-wrap gap-1">
            {monitoringRanges.map((value) => (
              <Button
                key={value}
                size="sm"
                variant={range === value ? "default" : "outline"}
                aria-pressed={range === value}
                onClick={() => changeRange(value)}
              >
                {t(`apiMonitoring.${{ "1h": "last1h", "6h": "last6h", "24h": "last24h", "7d": "last7d" }[value]}`)}
              </Button>
            ))}
          </div>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={t("datatable.refresh")}
            disabled={monitoring.loading}
            onClick={() => void monitoring.refresh()}
          >
            <RefreshCw className={monitoring.loading ? "animate-spin" : ""} />
          </Button>
        </div>
      </div>
      <section aria-label={t("apiMonitoring.summary")} aria-busy={q.overview.isFetching}>
        <MonitoringState resource={q.overview}>
          <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {summaries.map((item) => (
              <div key={item.key} className="min-w-0 rounded-lg border bg-card p-5">
                <dt className="text-sm text-muted-foreground">{t(`apiMonitoring.${item.key}`)}</dt>
                <dd className="mt-2 text-2xl font-semibold tabular-nums">{item.value}</dd>
              </div>
            ))}
          </dl>
        </MonitoringState>
      </section>
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <MonitoringFigure
          title={t("apiMonitoring.distribution")}
          resource={q.distribution}
          empty={!monitoring.distribution?.length}
        >
          <MonitoringDistribution data={monitoring.distribution ?? []} />
        </MonitoringFigure>
        <MonitoringFigure title={t("apiMonitoring.trend")} resource={q.trend} empty={!monitoring.trend?.length}>
          <MonitoringTrend data={monitoring.trend ?? []} />
        </MonitoringFigure>
        <MonitoringFigure
          title={t("apiMonitoring.topRequests")}
          resource={q.topRequests}
          empty={!monitoring.topRequests?.length}
        >
          <MonitoringRanking data={monitoring.topRequests ?? []} />
        </MonitoringFigure>
        <MonitoringFigure title={t("apiMonitoring.topP95")} resource={q.topP95} empty={!monitoring.topP95?.length}>
          <MonitoringRanking data={monitoring.topP95 ?? []} p95 />
        </MonitoringFigure>
      </div>
      <section className="grid min-w-0 gap-4 rounded-lg border p-4">
        <h2 className="font-semibold">{t("apiMonitoring.detail")}</h2>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            apply(draft)
          }}
        >
          <FormField htmlFor="api-monitoring-path" label={t("apiMonitoring.path")}>
            <Input
              id="api-monitoring-path"
              value={draft.keyword}
              placeholder={t("apiMonitoring.searchPlaceholder")}
              onChange={(event) => setDraft({ ...draft, keyword: event.target.value })}
            />
          </FormField>
          <FormField label={t("apiMonitoring.method")}>
            <FormSelect
              label={t("apiMonitoring.method")}
              value={draft.method ?? "all"}
              options={[
                { value: "all", label: t("apiMonitoring.allMethods") },
                ...monitoringMethods.map((value) => ({ value, label: value })),
              ]}
              onChange={(value) =>
                setDraft({ ...draft, method: monitoringMethods.find((method) => method === value) ?? null })
              }
            />
          </FormField>
          <Button type="submit">{t("common.search")}</Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              const empty = { keyword: "", method: null }
              setDraft(empty)
              apply(empty)
            }}
          >
            {t("common.reset")}
          </Button>
        </form>
        <ApiMonitoringTable
          records={monitoring.records}
          total={monitoring.total}
          page={page}
          pageSize={pageSize}
          loading={q.list.isFetching}
          failed={q.list.isError}
          onRetry={() => void q.list.refetch()}
          onPageChange={setPage}
          onPageSizeChange={(value) => {
            setPageSize(value)
            setPage(1)
          }}
          sort={sort}
          onSort={changeSort}
        />
      </section>
    </div>
  )
}
export default function ApiMonitoringPage() {
  useAuthStore((state) => state.token)
  const read = usePermission("monitoring:read"),
    { t } = useTranslation()
  return read ? <ApiMonitoringWorkbench key={getAuthSession()} /> : <p role="alert">{t("error.403")}</p>
}
