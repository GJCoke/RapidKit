import { useTranslation } from "react-i18next"
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from "recharts"
import { useHomeOverview } from "@/services/hooks/use-home-dashboard"
import { FormSelect } from "@/shared/crud/form-select"
import { HomeCard, HomeState } from "./home-card"
import { changeTone, formatUptime } from "./home-model"
export function OperationsOverviewModule() {
  const { t, i18n } = useTranslation(),
    query = useHomeOverview(),
    data = query.data
  const label = (key: string) => t(`homeDashboard.${key}`)
  const number = (value: number | null | undefined) =>
    value === null || value === undefined ? "—" : new Intl.NumberFormat(i18n.language).format(value)
  const percent = (value: number | null | undefined) =>
    value === null || value === undefined ? "—" : `${value.toFixed(2)}%`
  const delta = (value: number | null | undefined, inverted = false, points = false) => {
    const tone = changeTone(value, inverted)
    return (
      <span
        className={
          tone === "success" ? "text-success" : tone === "destructive" ? "text-destructive" : "text-muted-foreground"
        }
      >
        {value === null || value === undefined
          ? "—"
          : `${value > 0 ? "↑ " : value < 0 ? "↓ " : ""}${Math.abs(value).toFixed(2)}${points ? label("percentagePoints") : "%"}`}
      </span>
    )
  }
  const uptime = data ? formatUptime(data.system.uptimeSeconds) : null
  const sync = data?.system.lastSyncAt
  const syncTime =
    sync && Number.isFinite(new Date(sync).getTime())
      ? new Intl.DateTimeFormat(i18n.language, { hour: "2-digit", minute: "2-digit" }).format(new Date(sync))
      : "—"
  return (
    <HomeCard
      title={label("operationsOverview")}
      actions={
        <div className="w-36">
          <FormSelect
            label={label("operationsOverview")}
            value="7d"
            options={[{ value: "7d", label: label("last7Days") }]}
            onChange={() => {
              void query.refetch()
            }}
          />
        </div>
      }
    >
      <HomeState query={query}>
        {data && (
          <>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div>
                <dt className="text-sm text-muted-foreground">{label("serverStatus")}</dt>
                <dd className="mt-2 text-2xl font-semibold tabular-nums">
                  {number(data.summary.servers?.healthy)} / {number(data.summary.servers?.total)}
                </dd>
                <dd className="text-sm">{data.summary.servers ? label(data.summary.servers.status) : "—"}</dd>
              </div>
              {[
                { key: "activeUsers", item: data.summary.activeUsers },
                { key: "todayTasks", item: data.summary.tasks },
              ].map(({ key, item }) => (
                <div key={key}>
                  <dt className="text-sm text-muted-foreground">{label(key)}</dt>
                  <dd className="mt-2 flex flex-wrap items-baseline gap-2">
                    <strong className="text-2xl tabular-nums">{number(item?.today)}</strong>
                    {delta(item?.changePercent)}
                  </dd>
                  <dd className="text-xs text-muted-foreground">
                    {label("yesterday")} {number(item?.yesterday)}
                  </dd>
                </div>
              ))}
              <div>
                <dt className="text-sm text-muted-foreground">{label("apiErrorRate")}</dt>
                <dd className="mt-2 flex flex-wrap items-baseline gap-2">
                  <strong className="text-2xl tabular-nums">{percent(data.summary.apiErrorRate?.today)}</strong>
                  {delta(data.summary.apiErrorRate?.changePoints, true, true)}
                </dd>
                <dd className="text-xs text-muted-foreground">
                  {label("yesterday")} {percent(data.summary.apiErrorRate?.yesterday)}
                </dd>
              </div>
            </dl>
            {data.trend.length ? (
              <figure
                className="mt-5 min-w-0"
                aria-label={`${label("requestCount")} / ${label("averageResponseTime")}`}
              >
                <div className="h-56 min-w-0 w-full">
                  <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 600, height: 224 }}>
                    <LineChart data={data.trend} accessibilityLayer margin={{ left: 0, right: 0, top: 12, bottom: 0 }}>
                      <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(value) => String(value).slice(5)}
                        stroke="var(--muted-foreground)"
                        fontSize={11}
                      />
                      <YAxis
                        yAxisId="requests"
                        width={42}
                        allowDecimals={false}
                        stroke="var(--muted-foreground)"
                        fontSize={11}
                      />
                      <YAxis
                        yAxisId="latency"
                        width={40}
                        orientation="right"
                        stroke="var(--muted-foreground)"
                        fontSize={11}
                      />
                      <Tooltip
                        contentStyle={{ background: "var(--popover)", borderColor: "var(--border)", borderRadius: 8 }}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Line
                        yAxisId="requests"
                        dataKey="requestCount"
                        name={label("requestCount")}
                        stroke="var(--primary)"
                        isAnimationActive={false}
                      />
                      <Line
                        yAxisId="latency"
                        dataKey="avgResponseMs"
                        name={`${label("averageResponseTime")} (ms)`}
                        stroke="var(--chart-2)"
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </figure>
            ) : (
              <p className="my-6 text-center text-sm text-muted-foreground">{label("noData")}</p>
            )}
            <dl className="mt-4 grid grid-cols-1 gap-4 border-t pt-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
              <div>
                <dt className="text-muted-foreground">{label("systemUptime")}</dt>
                <dd className="mt-1 font-medium">
                  {uptime &&
                    `${uptime.days} ${label("days")} ${uptime.hours} ${label("hours")} ${uptime.minutes} ${label("minutes")}`}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{label("queueDepth")}</dt>
                <dd className="mt-1 font-medium">{number(data.system.queueDepth)}</dd>
                <dd className="text-xs">
                  {label("yesterday")} {delta(data.system.queueDepthChangePercent, true)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{label("lastDataSync")}</dt>
                <dd className="mt-1 font-medium">{syncTime}</dd>
                <dd className="text-xs">{label(`syncState.${data.system.syncStatus}`)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{label("taskSuccessRate7d")}</dt>
                <dd className="mt-1 font-medium">{percent(data.system.taskSuccessRate7D)}</dd>
                <dd className="text-xs">{delta(data.system.taskSuccessRateChangePoints, false, true)}</dd>
              </div>
            </dl>
          </>
        )}
      </HomeState>
    </HomeCard>
  )
}
