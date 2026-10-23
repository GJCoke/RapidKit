import { useTranslation } from "react-i18next"
import { Badge, Button, Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@rapidkit/ui"
import { PageHeader } from "@/features/layout/components/page-header"
import { EmptyState } from "@/features/layout/components/states"
import type { useQueueDashboard } from "@/services/hooks/use-queue-dashboard"
import { parseApiDate } from "@/shared/date-time"
import { translateText } from "@/shared/i18n-text"
import { queueState, sortQueues, utilization } from "./queue-model"
import { QueueSection, queueNumber, queueTime } from "./queue-presentation"
import { QueueChart } from "./queue-chart"
export function QueueStatsPanel({
  state,
  onViewWorkers,
  onViewRecords,
}: {
  state: ReturnType<typeof useQueueDashboard>
  onViewWorkers: () => void
  onViewRecords: (filter: { task?: string; worker?: string; status?: string }) => void
}) {
  const { t, i18n } = useTranslation(),
    p = "queueDashboard.overview.",
    data = state.overview,
    number = (value: number | null | undefined, digits = 2) => queueNumber(value, i18n.language, digits),
    text = (key: string, params?: Record<string, unknown>) => translateText(t, `${p}${key}`, params)
  const queues = sortQueues(data?.queues ?? []),
    blocked = queues.filter((queue) => queueState(queue) === "blocked"),
    offline = Math.max(0, (data?.totalWorkers ?? 0) - (data?.onlineWorkers ?? 0)),
    stale = Boolean(data && state.now - parseApiDate(data.sampledAt).getTime() > 60000),
    occupied = utilization(data?.activeTasks ?? 0, data?.concurrency ?? 0)
  const attention =
    state.overviewFailed ||
    stale ||
    !data ||
    data.onlineWorkers === 0 ||
    offline > 0 ||
    blocked.length > 0 ||
    data.queueDepth === null ||
    data.queues.some((queue) => queue.consumers === null)
  const metrics = [
    { key: "depth", value: number(data?.queueDepth), unit: "", hint: text("depthHint"), live: true },
    {
      key: "active",
      value: number(data?.activeTasks),
      unit: "",
      hint: text("capacity", { count: number(data?.concurrency) }),
      live: true,
    },
    {
      key: "throughput",
      value: number(data?.throughput),
      unit: text("perMinute"),
      hint: text("throughputHint"),
      live: true,
    },
    {
      key: "successRate",
      value: number(data?.successRate),
      unit: data?.successRate === null || !data ? "" : "%",
      hint: data
        ? text("successHint", { success: number(data.success), failure: number(data.failure) })
        : text("noSamples"),
      live: false,
    },
    {
      key: "p95",
      value: number(data?.p95Runtime, 3),
      unit: data?.p95Runtime === null || !data ? "" : "s",
      hint: data?.avgRuntime !== null && data ? text("avg", { value: number(data.avgRuntime, 3) }) : text("noSamples"),
      live: false,
    },
  ]
  return (
    <div className="grid min-w-0 gap-4">
      <div className="grid min-w-0 gap-3 rounded-lg border bg-card p-4">
        <PageHeader title={text("title")} description={text("subtitle")} />
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
          <Badge variant={state.connected ? "secondary" : "outline"}>
            {text(state.connected ? "live" : "disconnected")}
          </Badge>
          <div className="flex flex-wrap gap-2">
            {[1, 7, 30].map((days) => (
              <Button
                key={days}
                size="sm"
                variant={days === state.days ? "default" : "outline"}
                aria-pressed={days === state.days}
                onClick={() => state.setDays(days)}
              >
                {t(`queueDashboard.stats.${days === 1 ? "last24h" : days === 7 ? "last7d" : "last30d"}`)}
              </Button>
            ))}
            <Button size="sm" variant="outline" disabled={state.loading} onClick={() => void state.refresh()}>
              {state.loading ? t("common.loading") : text("refresh")}
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t pt-3 text-xs text-muted-foreground">
          <Button variant="link" size="sm" onClick={onViewWorkers}>
            {text("workers")}{" "}
            <strong>
              {number(data?.onlineWorkers)} / {number(data?.totalWorkers)}
            </strong>
          </Button>
          <span>
            {text("utilization")}{" "}
            <strong className="ml-2 text-foreground">{occupied === null ? "—" : `${occupied}%`}</strong>
          </span>
          <span className="ml-auto">
            {text("updated")} {queueTime(data?.sampledAt, i18n.language)}
          </span>
        </div>
      </div>
      <section
        role="status"
        aria-label={text(attention ? "attention" : "healthy")}
        className={`grid min-w-0 gap-2 rounded-lg border p-4 ${attention ? "border-amber-500/50 bg-amber-500/5" : "border-emerald-500/50 bg-emerald-500/5"}`}
      >
        <h2 className="font-semibold">{text(attention ? "attention" : "healthy")}</h2>
        <div className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          {state.overviewFailed && <span>{text("unavailable")}</span>}
          {stale && <span>{text("stale")}</span>}
          {data && (
            <>
              {!data.onlineWorkers ? (
                <span>{text("noWorkers")}</span>
              ) : (
                offline > 0 && (
                  <Button variant="link" size="sm" onClick={onViewWorkers}>
                    {text("offline", { count: offline })}
                  </Button>
                )
              )}
              {blocked.map((queue) => (
                <span key={queue.name} className="break-all">
                  {text("blocked", { name: queue.name, count: queue.depth })}
                </span>
              ))}
              {data.failure > 0 && (
                <Button variant="link" size="sm" onClick={() => onViewRecords({ status: "4" })}>
                  {text("failures", { count: data.failure })}
                </Button>
              )}
              {data.queues.some((queue) => queue.consumers === null) && <span>{text("consumersUnknown")}</span>}
              {data.queueDepth === null && <span>{text("brokerUnknown")}</span>}
            </>
          )}
          {!attention && <span>{text("normalHint")}</span>}
        </div>
      </section>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-busy={state.loading && !data}>
        {metrics.map((metric) => (
          <section
            key={metric.key}
            role="group"
            aria-label={text(metric.key)}
            className="grid min-w-0 content-start gap-3 rounded-lg border bg-card p-4"
          >
            <h2 className="text-sm text-muted-foreground">{text(metric.key)}</h2>
            <p className="flex flex-wrap items-baseline gap-2">
              <strong className="text-3xl font-semibold tabular-nums">{metric.value}</strong>
              <span className="text-xs">{metric.unit}</span>
            </p>
            <p className="min-h-8 text-xs text-muted-foreground">{metric.hint}</p>
            <Badge variant="secondary" className="w-fit">
              {text(metric.live ? "current" : "window")}
            </Badge>
          </section>
        ))}
      </div>
      <div className="grid min-w-0 gap-3 xl:grid-cols-5">
        <QueueSection title={text("completionTrend")} description={text("completionHint")} className="xl:col-span-3">
          {data?.timeline.length ? (
            <QueueChart kind="completion" dashboard={data} />
          ) : (
            <EmptyState message={text("emptyTasks")} />
          )}
        </QueueSection>
        <QueueSection
          title={text("depthTrend")}
          description={`${text("depthTrendHint")} · ${text("historyGap")}`}
          className="xl:col-span-2"
        >
          {data?.depthTimeline.length ? (
            <QueueChart kind="depth" dashboard={data} />
          ) : (
            <EmptyState message={text("emptyHistory")} />
          )}
        </QueueSection>
      </div>
      <div className="grid min-w-0 gap-3 xl:grid-cols-5">
        <QueueSection title={text("queues")} className="xl:col-span-3">
          <div className="max-h-70 min-w-0 overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-card">
                <TableRow>
                  {["queueName", "depth", "consumers", "state"].map((key) => (
                    <TableHead key={key}>{text(key)}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {queues.map((queue) => {
                  const status = queueState(queue)
                  return (
                    <TableRow key={queue.name}>
                      <TableCell className="max-w-60 whitespace-normal break-all font-medium">{queue.name}</TableCell>
                      <TableCell className="tabular-nums">{number(queue.depth)}</TableCell>
                      <TableCell className="tabular-nums">{number(queue.consumers)}</TableCell>
                      <TableCell>
                        <Badge variant={status === "blocked" ? "destructive" : "secondary"}>
                          {text(
                            status === "blocked"
                              ? "queueBlocked"
                              : status === "unknown"
                                ? "queueUnknown"
                                : status === "healthy"
                                  ? "queueHealthy"
                                  : "queueIdle",
                          )}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
          {!queues.length && <EmptyState message={text("noQueues")} />}
          <p className="text-xs text-muted-foreground">{text("queueNote")}</p>
        </QueueSection>
        <QueueSection title={text("outcomes")} className="xl:col-span-2">
          {(["success", "failure", "retry", "revoked"] as const).map((key) => (
            <div key={key} className="flex items-center justify-between gap-3 text-sm">
              <span>{text(key)}</span>
              {key === "failure" ? (
                <Button
                  variant="link"
                  size="sm"
                  disabled={!data?.failure}
                  onClick={() => onViewRecords({ status: "4" })}
                >
                  {number(data?.failure)} ↗
                </Button>
              ) : (
                <strong className="tabular-nums">{number(data?.[key])}</strong>
              )}
            </div>
          ))}
          {Boolean(data?.failure) && (
            <Button variant="outline" size="sm" onClick={() => onViewRecords({ status: "4" })}>
              {text("viewFailures")}
            </Button>
          )}
          <p className="text-xs text-muted-foreground">{text("retryHint")}</p>
        </QueueSection>
      </div>
      <div className="grid min-w-0 gap-3 lg:grid-cols-2">
        {(["tasks", "workers"] as const).map((kind) => (
          <QueueSection
            key={kind}
            title={text(kind === "tasks" ? "taskRanking" : "workerRanking")}
            description={text("rankingHint")}
          >
            {state.rankingFailed && (
              <p role="alert" className="text-xs text-amber-700 dark:text-amber-300">
                {text("partial")}
              </p>
            )}
            {(kind === "tasks" ? state.tasks.length : state.workerRanking.length) ? (
              <QueueChart
                kind={kind}
                tasks={state.tasks}
                workers={state.workerRanking}
                onSelect={(name) => onViewRecords(kind === "tasks" ? { task: name } : { worker: name })}
              />
            ) : (
              <EmptyState message={text(state.rankingFailed ? "partial" : "noSamples")} />
            )}
          </QueueSection>
        ))}
      </div>
    </div>
  )
}
