import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router"
import { X } from "lucide-react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Badge,
  Button,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@rapidkit/ui"
import { usePermission } from "@/features/auth"
import { getAuthSession } from "@/services/auth-session"
import { queueKeys, queueData, requireQueuePermission } from "@/services/hooks/use-queue-dashboard"
import { fetchWorkerDetail, type WorkerCommand } from "@/services/api/worker"
import { EmptyState } from "@/features/layout/components/states"
import { workerHealth, workerCapacity, type NormalizedWorker } from "./queue-model"
import { QueueSection, queueNumber, queueTime } from "./queue-presentation"
import { WorkerControls } from "./worker-controls"
import { WorkerTaskScene, type WorkerTaskSceneHandle } from "./worker-task-scene"
function environmentValue(value: unknown) {
  return value === undefined || value === null
    ? "—"
    : typeof value === "object"
      ? JSON.stringify(value, null, 2)
      : String(value)
}
export function WorkerDrawer({
  id,
  worker,
  pending,
  onClose,
  onRefresh,
  onCommand,
}: {
  id: string
  worker: NormalizedWorker | null
  pending: boolean
  onClose: () => void
  onRefresh: () => Promise<void>
  onCommand: (id: string, command: WorkerCommand) => Promise<boolean>
}) {
  const { t, i18n } = useTranslation(),
    navigate = useNavigate(),
    client = useQueryClient(),
    session = useRef(getAuthSession()).current,
    canRead = usePermission("worker:read"),
    canControl = usePermission("worker:control"),
    p = "queueDashboard.",
    [now, setNow] = useState(Date.now),
    [tab, setTab] = useState("overview"),
    [visitedTasks, setVisitedTasks] = useState(false),
    taskScene = useRef<WorkerTaskSceneHandle>(null)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000)
    return () => clearInterval(timer)
  }, [])
  const key = [...queueKeys.worker(session, id), "detail"],
    detail = useQuery({
      queryKey: key,
      queryFn: () => {
        requireQueuePermission("worker:read", session)
        return queueData(fetchWorkerDetail(id))
      },
      enabled: canRead && Boolean(worker),
      staleTime: 0,
      gcTime: 0,
      retry: false,
      refetchOnMount: "always",
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    })
  useEffect(
    () => () => {
      const filter = {
        queryKey: [...queueKeys.worker(session, id), "detail"],
        exact: true,
        predicate: (query: { getObserversCount: () => number }) => query.getObserversCount() === 0,
      }
      void client.cancelQueries(filter)
      client.removeQueries(filter)
    },
    [client, id, session],
  )
  useEffect(() => {
    if (!canControl && tab === "operations") setTab("overview")
  }, [canControl, tab])
  useEffect(() => {
    if (worker) return
    setTab("overview")
    setVisitedTasks(false)
    void client.resetQueries({ queryKey: [...queueKeys.worker(session, id), "detail"], exact: true })
  }, [client, id, session, worker?.id])
  const health = workerHealth(worker, now),
    online = health === "online",
    runtime = detail.isFetchedAfterMount ? detail.data : undefined,
    concurrency = runtime?.runtimeConcurrency,
    active = runtime?.runtimeActiveTasks,
    ready = online && concurrency !== undefined && concurrency !== null && active !== undefined && active !== null,
    capacity = workerCapacity(active ?? 0, concurrency ?? 0),
    queues = (runtime?.activeQueues ?? worker?.activeQueues ?? []).filter(
      (queue): queue is string => typeof queue === "string",
    ),
    software = worker?.softwareInfo ?? {}
  const refresh = async () => {
    await Promise.all([
      onRefresh(),
      detail.refetch(),
      ...(tab === "tasks" && taskScene.current ? [taskScene.current.refresh()] : []),
    ])
  }
  const metrics = [
    { key: "detail.executing", value: active, hint: "detail.snapshotHint" },
    { key: "concurrency", value: concurrency, hint: "detail.capacityHint" },
    { key: "detail.processed", value: worker?.processedCount, hint: "detail.processedHint" },
  ]
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <SheetContent
        showCloseButton={false}
        className="flex min-w-0 flex-col gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[760px]"
      >
        <SheetHeader className="relative border-b p-5 pr-12">
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-4 right-4 size-7"
            aria-label={t(`${p}close`)}
            onClick={onClose}
          >
            <X className="size-4" />
          </Button>
          <SheetTitle>{t(`${p}workerDetail`)}</SheetTitle>
          <SheetDescription>{worker?.hostname ?? t(`${p}detail.workerUnavailable`)}</SheetDescription>
        </SheetHeader>
        <div className="grid min-h-0 min-w-0 flex-1 content-start gap-4 overflow-y-auto p-5">
          {!worker ? (
            <EmptyState message={t(`${p}detail.workerUnavailable`)} />
          ) : (
            <>
              <header className="grid min-w-0 gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={online ? "secondary" : "outline"}>
                    {t(
                      `${p}${health === "online" ? "status.online" : health === "offline" ? "status.offline" : health === "stale" ? "detail.heartbeatStale" : "detail.heartbeatUnknown"}`,
                    )}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {t(`${p}lastHeartbeat`)} {queueTime(worker.lastHeartbeat, i18n.language)}
                  </span>
                </div>
                <h2 className="break-all text-xl font-semibold">{worker.hostname}</h2>
                <div className="flex flex-wrap justify-between gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      onClose()
                      void navigate({
                        pathname: "/queue/task",
                        search: `?${new URLSearchParams({ view: "records", worker: worker.hostname, range: "7d" })}`,
                      })
                    }}
                  >
                    {t(`${p}viewRecords`)}
                  </Button>
                  <Button variant="outline" size="sm" disabled={detail.isFetching} onClick={() => void refresh()}>
                    {t("datatable.refresh")}
                  </Button>
                </div>
              </header>
              {detail.isError && (
                <p role="alert" className="text-sm text-amber-700 dark:text-amber-300">
                  {t(`${p}detailFailed`)}
                </p>
              )}
              <div className="grid min-w-0 gap-3 sm:grid-cols-3">
                {metrics.map((metric) => (
                  <section key={metric.key} className="min-w-0 rounded-lg bg-muted/40 p-3">
                    <h3 className="text-xs text-muted-foreground">{t(`${p}${metric.key}`)}</h3>
                    <p className="my-2 text-2xl font-semibold tabular-nums">
                      {queueNumber(metric.value, i18n.language)}
                    </p>
                    <p className="text-xs text-muted-foreground">{t(`${p}${metric.hint}`)}</p>
                  </section>
                ))}
              </div>
              {!online && (
                <p role="alert" className="rounded-lg border border-amber-500/50 p-3 text-sm">
                  {t(`${p}detail.staleSnapshot`)}
                </p>
              )}
              <Tabs
                value={tab}
                onValueChange={(value) => {
                  if (value === "overview" || value === "tasks" || value === "operations") {
                    setTab(value)
                    if (value === "tasks") setVisitedTasks(true)
                  }
                }}
              >
                <TabsList variant="line" className="max-w-full">
                  <TabsTrigger value="overview">{t(`${p}detail.overview`)}</TabsTrigger>
                  <TabsTrigger value="tasks">{t(`${p}detail.taskScene`)}</TabsTrigger>
                  {canControl && <TabsTrigger value="operations">{t(`${p}detail.operations`)}</TabsTrigger>}
                </TabsList>
                <TabsContent value="overview" className="grid min-w-0 gap-3">
                  <QueueSection title={t(`${p}overview.utilization`)}>
                    <div className="flex min-w-0 flex-wrap items-center gap-6">
                      <div className="relative flex size-33 shrink-0 items-center justify-center">
                        <svg viewBox="0 0 120 120" className="absolute inset-0 size-full -rotate-90" aria-hidden>
                          <circle cx="60" cy="60" r="50" fill="none" stroke="var(--muted)" strokeWidth="10" />
                          <circle
                            cx="60"
                            cy="60"
                            r="50"
                            fill="none"
                            stroke={capacity.overCapacity ? "var(--destructive)" : "var(--chart-2)"}
                            strokeWidth="10"
                            strokeDasharray={`${ready && capacity.percent !== null ? Math.min(100, capacity.percent) * Math.PI : 0} ${100 * Math.PI}`}
                          />
                        </svg>
                        <div className="z-1 text-center">
                          <strong className="text-2xl tabular-nums">
                            {ready && capacity.percent !== null ? `${Math.round(capacity.percent)}%` : "—"}
                          </strong>
                          <p className="mt-1 text-xs text-muted-foreground">{t(`${p}detail.capacityUsed`)}</p>
                        </div>
                      </div>
                      <div className="grid min-w-0 flex-1 basis-40 gap-3">
                        <p className="flex justify-between gap-3 text-sm">
                          <span>{t(`${p}detail.executing`)}</span>
                          <strong>{ready ? active : "—"}</strong>
                        </p>
                        <p className="flex justify-between gap-3 text-sm">
                          <span>{t(`${p}detail.available`)}</span>
                          <strong>{ready ? capacity.available : "—"}</strong>
                        </p>
                        <p className="text-xs text-muted-foreground">{t(`${p}detail.utilizationHint`)}</p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {runtime?.runtimeSampledAt
                        ? `${t(`${p}detail.inspectedAt`)} ${queueTime(runtime.runtimeSampledAt, i18n.language)}`
                        : t(`${p}detail.runtimeUnknown`)}
                    </p>
                    {ready && capacity.overCapacity && (
                      <p role="alert" className="text-sm text-amber-700 dark:text-amber-300">
                        {t(`${p}detail.overCapacity`)}
                      </p>
                    )}
                  </QueueSection>
                  <QueueSection title={t(`${p}detail.subscriptions`)}>
                    {queues.length ? (
                      <div className="flex min-w-0 flex-wrap gap-2">
                        {queues.map((queue) => (
                          <Badge key={queue} variant="secondary" className="max-w-full whitespace-normal break-all">
                            {queue}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">{t(`${p}detail.queuesUnknown`)}</p>
                    )}
                    <p className="text-xs text-muted-foreground">{t(`${p}detail.queueSnapshotHint`)}</p>
                  </QueueSection>
                  <details className="min-w-0 rounded-lg border p-4">
                    <summary className="cursor-pointer text-sm font-semibold">{t(`${p}detail.environment`)}</summary>
                    {!Object.keys(software).length ? (
                      <EmptyState message={t(`${p}detail.environmentUnknown`)} />
                    ) : (
                      <div className="mt-3 grid min-w-0 gap-3">
                        {[
                          { key: "celery_version", label: "Celery" },
                          { key: "python_version", label: "Python" },
                          { key: "platform", label: t(`${p}detail.platform`) },
                          ...Object.keys(software)
                            .filter((key) => !["celery_version", "python_version", "platform"].includes(key))
                            .map((key) => ({ key, label: key })),
                        ].map((field) => (
                          <div key={field.key} className="min-w-0 rounded-lg bg-muted/40 p-3">
                            <h3 className="text-xs text-muted-foreground">{field.label}</h3>
                            <pre className="mt-1 whitespace-pre-wrap break-all text-xs">
                              {environmentValue(software[field.key])}
                            </pre>
                          </div>
                        ))}
                      </div>
                    )}
                  </details>
                </TabsContent>
                <TabsContent value="tasks" keepMounted className="min-w-0">
                  {visitedTasks && <WorkerTaskScene ref={taskScene} id={id} online={online} />}
                </TabsContent>
                {canControl && (
                  <TabsContent value="operations" className="min-w-0">
                    <WorkerControls
                      worker={{ ...worker, concurrency: concurrency ?? worker.concurrency }}
                      online={online}
                      queues={queues}
                      pending={pending}
                      onCommand={onCommand}
                    />
                  </TabsContent>
                )}
              </Tabs>
            </>
          )}
        </div>
        <SheetFooter className="border-t p-4">
          <Button variant="outline" onClick={onClose}>
            {t(`${p}close`)}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
