import { forwardRef, useImperativeHandle } from "react"
import { useTranslation } from "react-i18next"
import { Button, Badge } from "@rapidkit/ui"
import { useWorkerInspection } from "@/services/hooks/use-worker-inspection"
import { EmptyState, LoadingState } from "@/features/layout/components/states"
import { QueueSection, queueTime } from "./queue-presentation"
export interface WorkerTaskSceneHandle {
  refresh: () => Promise<boolean>
}
export const WorkerTaskScene = forwardRef<WorkerTaskSceneHandle, { id: string; online: boolean }>(
  function WorkerTaskScene({ id, online }, ref) {
    const { t, i18n } = useTranslation(),
      state = useWorkerInspection(id, online),
      p = "queueDashboard.detail."
    useImperativeHandle(ref, () => ({ refresh: state.refresh }), [state.refresh])
    return (
      <div className="grid min-w-0 gap-3">
        <p className="text-xs text-muted-foreground">{t(`${p}manualRefresh`)}</p>
        {(["active", "reserved"] as const).map((kind) => {
          const sample = state[kind],
            title = t(`${p}${kind}Title`)
          return (
            <QueueSection key={kind} title={title} description={t(`${p}${kind}Hint`)}>
              <div className="flex items-center justify-between gap-3">
                <Badge variant="secondary">{sample.sampledAt === null ? "—" : sample.rows.length}</Badge>
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={`${t("datatable.refresh")}${title}`}
                  disabled={!online || state.active.loading || state.reserved.loading}
                  onClick={() => void state.refresh()}
                >
                  {sample.loading ? t("common.loading") : t("datatable.refresh")}
                </Button>
              </div>
              {sample.failed && (
                <p role="alert" className="text-sm text-amber-700 dark:text-amber-300">
                  {t(`${p}${sample.sampledAt ? "inspectionStale" : "inspectionFailed"}`)}
                </p>
              )}
              <div className="max-h-60 min-w-0 overflow-y-auto">
                {!online ? (
                  <EmptyState message={t(`${p}inspectionOffline`)} />
                ) : sample.loading && sample.sampledAt === null ? (
                  <LoadingState label={t("common.loading")} />
                ) : sample.sampledAt !== null && !sample.rows.length && !sample.failed ? (
                  <EmptyState message={t(`${p}${kind === "active" ? "noActive" : "noReserved"}`)} />
                ) : (
                  sample.rows.map((task) => (
                    <article key={task.id} className="min-w-0 border-b py-3 last:border-0">
                      <h3 className="break-all text-sm font-semibold">{task.name}</h3>
                      <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{task.id}</p>
                      <div className="mt-2 flex flex-wrap gap-3 text-xs">
                        {Boolean(task.workerPid) && <span>PID {task.workerPid}</span>}
                        {typeof task.timeStart === "number" && task.timeStart !== 0 && (
                          <span>
                            {t("queueDashboard.startedAt")} {queueTime(task.timeStart * 1000, i18n.language)}
                          </span>
                        )}
                      </div>
                      {(task.args || task.kwargs) && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs">{t(`${p}parameters`)}</summary>
                          {(["args", "kwargs"] as const).map(
                            (key) =>
                              task[key] && (
                                <div key={key} className="mt-2">
                                  <h4 className="text-xs text-muted-foreground">{t(`queueDashboard.${key}`)}</h4>
                                  <pre className="mt-1 whitespace-pre-wrap break-all text-xs">{task[key]}</pre>
                                </div>
                              ),
                          )}
                        </details>
                      )}
                    </article>
                  ))
                )}
              </div>
              <p className="text-xs text-muted-foreground">{t(`${p}instantSnapshot`)}</p>
              <p className="text-xs text-muted-foreground">
                {t(`${p}inspectedAt`)} {queueTime(sample.sampledAt, i18n.language)}
              </p>
            </QueueSection>
          )
        })}
      </div>
    )
  },
)
