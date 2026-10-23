import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router"
import { Power } from "lucide-react"
import {
  Badge,
  Button,
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
import { getAuthSession } from "@/services/auth-session"
import { useQueueDashboard, queueAccess } from "@/services/hooks/use-queue-dashboard"
import { useWorkerCommands } from "@/services/hooks/use-worker-commands"
import { EmptyState, LoadingState } from "@/features/layout/components/states"
import { QueueStatsPanel } from "./modules/queue-stats-panel"
import { WorkerDrawer } from "./modules/worker-drawer"
import { queueRecordLocation } from "./modules/queue-model"
import { queueNumber, queueTime } from "./modules/queue-presentation"
function QueueDashboardBody() {
  const { t, i18n } = useTranslation(),
    state = useQueueDashboard(),
    commands = useWorkerCommands(),
    canControl = usePermission("worker:control"),
    navigate = useNavigate(),
    session = getAuthSession(),
    p = "queueDashboard.",
    [selectedId, setSelectedId] = useState<string | null>(null),
    [shutdown, setShutdown] = useState<string | null>(null),
    [shutdownFailed, setShutdownFailed] = useState(false),
    workerSection = useRef<HTMLElement>(null),
    alive = useRef(true),
    epoch = useRef(0)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      epoch.current++
    }
  }, [])
  useEffect(() => {
    if (!canControl) {
      setShutdown(null)
      setShutdownFailed(false)
      epoch.current++
    }
  }, [canControl])
  useEffect(() => {
    if (shutdown && !state.workers.some((worker) => worker.id === shutdown)) setShutdown(null)
  }, [shutdown, state.workers])
  const stopWorker = async (id: string) => {
    const request = ++epoch.current
    setShutdown(null)
    setShutdownFailed(false)
    const accepted = await commands.run(id, { type: "shutdown" })
    if (!alive.current || request !== epoch.current || !queueAccess("worker:control", session)) return
    setShutdownFailed(!accepted)
    if (accepted) toast.success(t(`${p}control.shutdownSuccess`))
  }
  return (
    <div className="grid min-w-0 gap-4">
      <QueueStatsPanel
        state={state}
        onViewWorkers={() => workerSection.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
        onViewRecords={(filter) => void navigate(queueRecordLocation(state.days, filter))}
      />
      <section
        ref={workerSection}
        aria-label={t(`${p}workerCards`)}
        className="grid min-w-0 gap-3 rounded-lg border bg-card p-4"
      >
        <h2 className="font-semibold">{t(`${p}workerCards`)}</h2>
        {state.workersFailed && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 text-sm text-amber-700 dark:text-amber-300"
          >
            <p>{t(`${p}workersFailed`)}</p>
            <Button size="sm" variant="outline" onClick={() => void state.refresh()}>
              {t("common.retry")}
            </Button>
          </div>
        )}
        {shutdownFailed && (
          <p role="alert" className="text-sm text-destructive">
            {t(`${p}detail.commandFailed`)}
          </p>
        )}
        {state.workersLoading && !state.workers.length ? (
          <LoadingState label={t("common.loading")} />
        ) : !state.workers.length ? (
          <EmptyState message={t(`${p}noWorkers`)} />
        ) : (
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-busy={state.workersLoading}>
            {state.workers.map((worker) => (
              <article key={worker.id} className="relative min-w-0 rounded-lg border hover:bg-muted/30">
                <button
                  type="button"
                  aria-label={worker.hostname}
                  disabled={state.workersLoading}
                  className="block w-full min-w-0 rounded-lg p-4 text-left focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                  onClick={() => setSelectedId(worker.id)}
                >
                  <header className={`mb-3 flex min-w-0 flex-wrap items-center gap-2 ${canControl ? "pr-8" : ""}`}>
                    <h3 className="min-w-0 truncate text-sm font-semibold" title={worker.hostname}>
                      {worker.hostname}
                    </h3>
                    <Badge variant={worker.status === "1" ? "secondary" : "outline"}>
                      {t(`${p}status.${worker.status === "1" ? "online" : "offline"}`)}
                    </Badge>
                  </header>
                  <dl className="grid min-w-0 gap-2 text-xs text-muted-foreground">
                    {[
                      { key: "concurrency", value: worker.concurrency },
                      { key: "activeTaskCount", value: worker.activeTaskCount },
                      { key: "processedCount", value: worker.processedCount },
                    ].map((metric) => (
                      <div key={metric.key} className="flex justify-between gap-3">
                        <dt>{t(`${p}${metric.key}`)}</dt>
                        <dd className="font-medium text-foreground tabular-nums">
                          {queueNumber(metric.value, i18n.language)}
                        </dd>
                      </div>
                    ))}
                    <div className="grid gap-1">
                      <dt>{t(`${p}lastHeartbeat`)}</dt>
                      <dd className="break-words text-foreground">{queueTime(worker.lastHeartbeat, i18n.language)}</dd>
                    </div>
                  </dl>
                </button>
                {canControl && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="absolute top-3 right-3 size-7 text-destructive"
                    aria-label={`${t(`${p}control.shutdown`)} ${worker.hostname}`}
                    disabled={worker.status !== "1" || commands.isPending(worker.id) || state.workersLoading}
                    onClick={() => setShutdown(worker.id)}
                  >
                    <Power className="size-4" />
                  </Button>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
      {selectedId && (
        <WorkerDrawer
          key={selectedId}
          id={selectedId}
          worker={state.workers.find((worker) => worker.id === selectedId) ?? null}
          pending={commands.isPending(selectedId)}
          onClose={() => setSelectedId(null)}
          onRefresh={state.refresh}
          onCommand={commands.run}
        />
      )}
      <AlertDialog
        open={canControl && Boolean(shutdown)}
        onOpenChange={(open) => {
          if (!open) setShutdown(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t(`${p}control.shutdown`)}</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="mb-2 block break-all font-medium">
                {state.workers.find((worker) => worker.id === shutdown)?.hostname}
              </span>
              {t(`${p}control.shutdownConfirm`)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setShutdown(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={!shutdown || commands.isPending(shutdown)}
              onClick={() => {
                if (shutdown) void stopWorker(shutdown)
              }}
            >
              {t("common.confirm")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
export default function QueueDashboardPage() {
  useAuthStore((state) => state.token)
  const canRead = usePermission("worker:read")
  return canRead ? <QueueDashboardBody key={getAuthSession()} /> : null
}
