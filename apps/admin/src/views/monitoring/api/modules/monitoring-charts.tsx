import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  ComposedChart,
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
  Tooltip,
} from "recharts"
import { Button, Skeleton } from "@rapidkit/ui"
import type { ApiDistribution, ApiTrend, ApiTop } from "@/services/api/api-monitoring"
const tooltipStyle = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  color: "var(--popover-foreground)",
}
function MonitoringTooltip({
  active,
  payload,
  label,
  format,
}: {
  active?: boolean
  payload?: readonly { name?: string | number; value?: unknown; color?: string }[]
  label?: unknown
  format?: (value: unknown, name?: string | number) => string
}) {
  if (!active || !payload?.length) return null
  return (
    <div
      role="tooltip"
      className="space-y-2 p-3 text-xs whitespace-normal wrap-anywhere"
      style={{ ...tooltipStyle, maxWidth: "min(280px, calc(100vw - 64px))" }}
    >
      {label !== undefined && label !== null && <p className="font-medium">{String(label)}</p>}
      <ul className="space-y-1">
        {payload.map((entry, index) => (
          <li key={`${entry.name}-${index}`} className="flex flex-wrap gap-x-2">
            <span>{String(entry.name ?? "")}</span>
            <strong>{format ? format(entry.value, entry.name) : String(entry.value ?? "")}</strong>
          </li>
        ))}
      </ul>
    </div>
  )
}
export interface MonitoringResource {
  isFetching: boolean
  isError: boolean
  data?: unknown
  refetch: () => Promise<unknown>
}
export function MonitoringState({
  resource,
  empty = false,
  children,
}: {
  resource: MonitoringResource
  empty?: boolean
  children: ReactNode
}) {
  const { t } = useTranslation()
  if (resource.isError)
    return (
      <div role="alert" className="grid justify-items-center gap-3 p-6">
        <p>{t("state.error")}</p>
        <Button variant="outline" onClick={() => void resource.refetch()}>
          {t("common.retry")}
        </Button>
      </div>
    )
  if (resource.isFetching && resource.data === undefined)
    return (
      <div role="status" className="grid gap-4 p-4">
        <span className="text-sm text-muted-foreground">{t("common.loading")}</span>
        <Skeleton className="h-48 w-full" />
      </div>
    )
  if (empty)
    return (
      <p className="grid min-h-48 place-content-center text-sm text-muted-foreground">{t("apiMonitoring.noData")}</p>
    )
  return children
}
export function MonitoringFigure({
  title,
  resource,
  empty,
  children,
}: {
  title: string
  resource: MonitoringResource
  empty: boolean
  children: ReactNode
}) {
  return (
    <figure aria-label={title} aria-busy={resource.isFetching} className="min-w-0 rounded-lg border bg-card p-4">
      <figcaption className="mb-3 font-semibold">{title}</figcaption>
      <MonitoringState resource={resource} empty={empty}>
        {children}
      </MonitoringState>
    </figure>
  )
}
export function MonitoringDistribution({ data }: { data: ApiDistribution }) {
  const { t } = useTranslation(),
    rows = data.map((row) => ({
      ...row,
      name: row.path === "other" && row.method === "*" ? t("apiMonitoring.other") : `${row.method} ${row.path}`,
    }))
  return (
    <>
      <div className="h-64 min-w-0 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart accessibilityLayer>
            <Tooltip
              content={({ active, payload, label }) => (
                <MonitoringTooltip
                  active={active}
                  payload={payload}
                  label={label}
                  format={(value, name) => `${value} (${rows.find((row) => row.name === name)?.percentage ?? 0}%)`}
                />
              )}
            />
            <Pie
              data={rows}
              dataKey="requestCount"
              nameKey="name"
              innerRadius="38%"
              outerRadius="78%"
              isAnimationActive={false}
            >
              {rows.map((row, index) => (
                <Cell key={row.name} fill={`var(--chart-${(index % 5) + 1})`} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="max-h-28 space-y-1 overflow-y-auto text-xs">
        {rows.map((row, index) => (
          <li key={row.name} className="flex min-w-0 items-center gap-2">
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full"
              style={{ background: `var(--chart-${(index % 5) + 1})` }}
            />
            <span className="min-w-0 flex-1 truncate" title={row.name}>
              {row.name}
            </span>
            <span>
              {row.requestCount.toLocaleString()} · {row.percentage}%
            </span>
          </li>
        ))}
      </ul>
    </>
  )
}
export function MonitoringTrend({ data }: { data: ApiTrend }) {
  const { t } = useTranslation()
  return (
    <div className="h-75 min-w-0 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ left: 0, right: 0, top: 20, bottom: 0 }} accessibilityLayer>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
          <XAxis
            dataKey="timeBucket"
            tickFormatter={(value) => String(value).replace("T", " ").slice(5, 16)}
            stroke="var(--muted-foreground)"
            fontSize={10}
          />
          <YAxis yAxisId="requests" allowDecimals={false} width={40} stroke="var(--muted-foreground)" fontSize={11} />
          <YAxis
            yAxisId="errors"
            orientation="right"
            allowDecimals={false}
            width={36}
            stroke="var(--destructive)"
            fontSize={11}
          />
          <Tooltip
            content={({ active, payload, label }) => (
              <MonitoringTooltip active={active} payload={payload} label={label} />
            )}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar
            yAxisId="requests"
            dataKey="requestCount"
            name={t("apiMonitoring.requestCount")}
            fill="var(--primary)"
            maxBarSize={20}
            isAnimationActive={false}
          />
          <Line
            yAxisId="errors"
            type="monotone"
            dataKey="errorCount"
            name={t("apiMonitoring.errorCount")}
            stroke="var(--destructive)"
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
export function MonitoringRanking({ data, p95 = false }: { data: ApiTop; p95?: boolean }) {
  const { t } = useTranslation(),
    rows = data.map((row) => ({ ...row, name: `${row.method} ${row.path}` })),
    field = p95 ? "p95Ms" : "requestCount"
  return (
    <div className="h-75 min-w-0 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ left: 0, right: 12, top: 0, bottom: 0 }} accessibilityLayer>
          <CartesianGrid horizontal={false} stroke="var(--border)" />
          <XAxis type="number" allowDecimals={p95} stroke="var(--muted-foreground)" fontSize={11} />
          <YAxis
            type="category"
            dataKey="name"
            width={135}
            stroke="var(--muted-foreground)"
            fontSize={10}
            tickFormatter={(value) => (String(value).length > 20 ? `${String(value).slice(0, 19)}…` : String(value))}
            interval={0}
          />
          <Tooltip
            content={({ active, payload, label }) => (
              <MonitoringTooltip
                active={active}
                payload={payload}
                label={label}
                format={(value) => (p95 ? `${value} ms` : String(value))}
              />
            )}
          />
          <Bar
            dataKey={field}
            name={t(p95 ? "apiMonitoring.p95Ms" : "apiMonitoring.requestCount")}
            fill={p95 ? "var(--chart-3)" : "var(--primary)"}
            maxBarSize={16}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
