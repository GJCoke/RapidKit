import { Alert, AlertDescription } from "@rapidkit/ui/components/alert"
import { useCallback, useMemo, useState } from "react"
import { useSearchParams } from "react-router"
import { useTranslation } from "react-i18next"
import type { ColumnPinningState, VisibilityState } from "@tanstack/react-table"
import { Badge, Button } from "@rapidkit/ui"
import { Can } from "@/features/auth"
import { PageHeader } from "@/features/layout/components/page-header"
import { useAppStore } from "@/stores/app"
import { getAuthSession } from "@/services/auth-session"
import type { AuditLog, AuditLogQuery } from "@/services/api/audit-log"
import { useAuditCatalog, useAuditLogs } from "@/services/hooks/use-audit-log"
import { DataTable, TableColumnSetting, TableHeaderOperation, type DataTableColumn } from "@/shared/data-table"
import { auditActionLabel, auditIdentity, auditResourceLabel, formatAuditTime } from "./audit-log-display"
import { parseAuditLogQuery, serializeAuditLogQuery, type AuditLogPageState } from "./audit-log-query"
import { AuditLogSearch, auditFilterLabel } from "./modules/audit-log-search"
import { AuditLogDetailDrawer, AuditResultBadge } from "./modules/audit-log-detail-drawer"
function AuditLogContent() {
  const { t } = useTranslation(),
    isMobile = useAppStore((s) => s.isMobile)
  const [searchParams, setSearchParams] = useSearchParams()
  const queryString = searchParams.toString()
  const state = useMemo(() => parseAuditLogQuery(Object.fromEntries(new URLSearchParams(queryString))), [queryString])
  const catalog = useAuditCatalog(),
    logs = useAuditLogs(state.filters)
  const [visibility, setVisibility] = useState<VisibilityState>({ ip: false })
  const [pinning, setPinning] = useState<ColumnPinningState>({ left: [], right: ["actions"] })
  const [order, setOrder] = useState([
    "occurredAt",
    "actorName",
    "action",
    "resource",
    "result",
    "durationMs",
    "ip",
    "actions",
  ])
  const update = useCallback(
    (next: AuditLogPageState) => setSearchParams(serializeAuditLogQuery(next), { replace: true }),
    [setSearchParams],
  )
  const open = useCallback((id: string) => update({ ...state, selectedAuditId: id }), [state, update])
  const columns = useMemo<DataTableColumn<AuditLog>[]>(
    () => [
      {
        id: "occurredAt",
        header: t("audit.time"),
        size: 180,
        meta: { title: t("audit.time"), pinnable: true },
        cell: ({ row }) => formatAuditTime(row.original.occurredAt, catalog.data?.timezone),
      },
      {
        id: "actorName",
        header: t("audit.actor"),
        size: 190,
        meta: { title: t("audit.actor"), pinnable: true },
        cell: ({ row }) => (
          <div>
            <p>{auditIdentity(row.original) || t(`audit.identity.${row.original.actorType}`)}</p>
            {row.original.actorType === "system" && row.original.actorName && (
              <p className="text-xs text-muted-foreground">{row.original.actorName}</p>
            )}
            {row.original.impersonationSessionId && (
              <p className="text-xs text-muted-foreground">
                {t("audit.asUser", {
                  user: row.original.subjectName || row.original.subjectUsername || row.original.subjectUserId || "—",
                })}
              </p>
            )}
          </div>
        ),
      },
      {
        id: "action",
        header: t("audit.action"),
        size: 200,
        meta: { title: t("audit.action") },
        cell: ({ row }) => (
          <div className="grid gap-1">
            <span>{auditActionLabel(row.original.action, catalog.data, t)}</span>
            {row.original.riskLevel !== "normal" && (
              <Badge variant={row.original.riskLevel === "critical" ? "destructive" : "secondary"}>
                {t(`audit.risk.${row.original.riskLevel}`)}
              </Badge>
            )}
          </div>
        ),
      },
      {
        id: "resource",
        header: t("audit.resource"),
        size: 220,
        meta: { title: t("audit.resource") },
        cell: ({ row }) => (
          <div>
            <p>
              {row.original.targetCount
                ? t("audit.targetCount", { count: row.original.targetCount })
                : auditResourceLabel(row.original, t)}
            </p>
            <p className="text-xs text-muted-foreground">
              {catalog.data?.actions.find((action) => action.code === row.original.action)?.resourceLabel ||
                row.original.resourceType ||
                "—"}
              {row.original.resourceId ? ` · ${row.original.resourceId.slice(0, 8)}` : ""}
            </p>
          </div>
        ),
      },
      {
        id: "result",
        header: t("audit.resultLabel"),
        size: 180,
        meta: { title: t("audit.resultLabel") },
        cell: ({ row }) => (
          <div className="grid gap-1">
            <AuditResultBadge result={row.original.result} />
            {row.original.result !== "success" && (
              <p
                className="max-w-44 truncate text-xs text-muted-foreground"
                title={row.original.errorMessage ?? undefined}
              >
                {row.original.errorMessage || t("audit.openFailure")}
              </p>
            )}
          </div>
        ),
      },
      {
        id: "durationMs",
        header: t("audit.duration"),
        size: 100,
        meta: { title: t("audit.duration") },
        cell: ({ row }) =>
          row.original.durationMs === null || row.original.durationMs === undefined
            ? "—"
            : `${Math.round(row.original.durationMs)} ms`,
      },
      {
        id: "ip",
        header: t("audit.ip"),
        accessorKey: "ip",
        size: 140,
        meta: { title: t("audit.ip") },
        cell: ({ row }) => row.original.ip || "—",
      },
      {
        id: "actions",
        header: t("audit.actions"),
        size: 90,
        enableHiding: false,
        meta: { title: t("audit.actions"), hideable: false, pinnable: true },
        cell: ({ row }) => (
          <Button
            size="sm"
            variant="ghost"
            onClick={(event) => {
              event.stopPropagation()
              open(row.original.id)
            }}
          >
            {t("audit.detailAction")}
          </Button>
        ),
      },
    ],
    [t, catalog.data, open],
  )
  const filterKey = JSON.stringify(
    Object.entries(state.filters)
      .filter(([key]) => key !== "page" && key !== "pageSize")
      .sort(([a], [b]) => a.localeCompare(b)),
  )
  const page = state.filters.page ?? 1,
    pageSize = state.filters.pageSize ?? 20
  const conditions = Object.entries(state.filters)
    .filter(
      ([key, value]) =>
        !["page", "pageSize", "view"].includes(key) && value !== null && value !== undefined && value !== "",
    )
    .map(([key, value]) => {
      let label = String(value)
      if (key === "startTime" || key === "endTime") label = formatAuditTime(label, catalog.data?.timezone)
      if (key === "result" || key === "riskLevel" || key === "source")
        label = t(`audit.${key === "riskLevel" ? "risk" : key}.${label}`)
      if (key === "action") label = catalog.data?.actions.find((action) => action.code === value)?.label || label
      if (key === "resourceType")
        label = catalog.data?.actions.find((action) => action.resourceType === value)?.resourceLabel || label
      return `${t(`audit.${auditFilterLabel(key)}`)}: ${label}`
    })
  return (
    <div className="grid gap-4">
      <PageHeader title={t("audit.title")} description={t("audit.introduction")} />
      <AuditLogSearch
        key={filterKey}
        state={state}
        catalog={catalog.data}
        onApply={(filters, timeRange) =>
          update({ filters: { ...filters, page: 1, pageSize }, timeRange, selectedAuditId: state.selectedAuditId })
        }
      />
      {catalog.isError && (
        <Alert>
          <AlertDescription>
            {t("audit.catalogFailed")}
            <Button variant="outline" size="sm" onClick={() => void catalog.refetch()}>
              {t("datatable.retry")}
            </Button>
          </AlertDescription>
        </Alert>
      )}
      <section aria-label={t("audit.appliedFilters")} className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{t("audit.appliedFilters")}</span>
        <Badge variant="outline">{t(`audit.views.${state.filters.view ?? "all"}`)}</Badge>
        {state.timeRange === "all" && <Badge variant="outline">{t("audit.ranges.all")}</Badge>}
        {conditions.map((condition) => (
          <span key={condition} className="break-all text-xs text-muted-foreground">
            {condition}
          </span>
        ))}
      </section>
      <TableHeaderOperation
        refreshing={logs.isFetching}
        onRefresh={() => void logs.refetch()}
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
      <DataTable<AuditLog>
        columns={columns}
        data={logs.data?.records ?? []}
        getRowId={(row) => row.id}
        pagination={{ page, pageSize, total: logs.data?.total ?? 0 }}
        onPageChange={(next) => update({ ...state, filters: { ...state.filters, page: next } })}
        onPageSizeChange={(size) => update({ ...state, filters: { ...state.filters, page: 1, pageSize: size } })}
        loading={logs.isPending}
        error={logs.isError}
        onRetry={() => void logs.refetch()}
        emptyText={t("audit.noMatches")}
        columnVisibility={visibility}
        columnOrder={order}
        columnPinning={isMobile ? { left: [], right: [] } : pinning}
        onRowActivate={(row) => open(row.id)}
      />
      {!logs.isPending && !logs.isError && !logs.data?.records.length && (
        <Button
          variant="outline"
          onClick={() =>
            update({ filters: { page: 1, pageSize: 20 }, timeRange: "all", selectedAuditId: state.selectedAuditId })
          }
        >
          {t("audit.clearFilters")}
        </Button>
      )}
      {state.selectedAuditId && (
        <AuditLogDetailDrawer
          key={`${getAuthSession()}:${state.selectedAuditId}`}
          auditId={state.selectedAuditId}
          catalog={catalog.data}
          onClose={() => update({ ...state, selectedAuditId: null })}
        />
      )}
    </div>
  )
}
export default function AuditLogPage() {
  return (
    <Can permission="audit-log:read">
      <AuditLogContent />
    </Can>
  )
}
