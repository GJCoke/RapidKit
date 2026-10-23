import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Button, Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@rapidkit/ui"
import { useTaskDetail } from "@/services/hooks/use-tasks"
import { LoadingState, ErrorState } from "@/features/layout/components/states"
import { PythonArgumentsViewer } from "@/shared/python-arguments/viewer"
import { JsonViewer } from "@/shared/code-viewers/json-viewer"
import { LogViewer } from "@/shared/code-viewers/log-viewer"
import { copyText } from "@/shared/code-viewers/text-actions"
import { TaskStatusBadge, taskTime } from "./task-presentation"
function TaskFailure({
  id,
  status,
  exception,
  traceback,
}: {
  id: string
  status: string
  exception?: string | null
  traceback?: string | null
}) {
  const { t } = useTranslation(),
    [stack, setStack] = useState(false),
    [feedback, setFeedback] = useState(""),
    [copying, setCopying] = useState(false),
    hasMessage = Boolean(exception?.trim()),
    hasStack = Boolean(traceback?.trim())
  if (status !== "4" && !hasMessage && !hasStack) return null
  return (
    <section className="min-w-0 space-y-3" aria-label={t("task.exception")}>
      <div className="min-w-0 space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
        <h3 className="font-medium">{t("task.exception")}</h3>
        <p className="whitespace-pre-wrap wrap-anywhere text-sm">
          {hasMessage ? exception : t(hasStack ? "task.noExceptionMessage" : "task.noExceptionDetails")}
        </p>
        {hasMessage && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={copying}
              onClick={() => {
                setCopying(true)
                setFeedback("")
                void copyText(exception ?? "")
                  .then(
                    () => setFeedback("exceptionCopied"),
                    () => setFeedback("exceptionCopyFailed"),
                  )
                  .finally(() => setCopying(false))
              }}
            >
              {t("task.copyException")}
            </Button>
            {feedback && (
              <span role={feedback === "exceptionCopied" ? "status" : "alert"} className="text-xs">
                {t(`task.${feedback}`)}
              </span>
            )}
          </div>
        )}
      </div>
      {hasStack && (
        <>
          <Button type="button" variant="outline" aria-expanded={stack} onClick={() => setStack(!stack)}>
            {t("task.traceback")}
          </Button>
          {stack && (
            <LogViewer
              records={[{ id, message: traceback ?? "", level: "ERROR" }]}
              sourceKey={`${id}-traceback`}
              title={t("task.traceback")}
              filename={`task-${id}-traceback.log`}
              height={240}
            />
          )}
        </>
      )}
    </section>
  )
}
export function TaskDetailDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { t, i18n } = useTranslation(),
    query = useTaskDetail(id),
    task = query.data
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <SheetContent className="flex min-w-0 flex-col gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[560px]">
        <SheetHeader className="border-b p-4">
          <SheetTitle>{t("task.taskDetail")}</SheetTitle>
          <SheetDescription className="break-all">{id}</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 min-w-0 flex-1 space-y-5 overflow-y-auto p-4">
          {query.isPending ? (
            <LoadingState label={t("common.loading")} />
          ) : query.isError ? (
            <ErrorState message={t("datatable.loadFailed")} onRetry={() => void query.refetch()} />
          ) : (
            task && (
              <>
                <dl className="grid min-w-0 gap-3 rounded-lg border p-3 text-sm">
                  {[
                    { key: "taskId", value: task.taskId },
                    { key: "taskName", value: task.taskName },
                    { key: "taskStatus", value: <TaskStatusBadge status={task.status} /> },
                    { key: "workerHostname", value: task.workerHostname || "—" },
                    { key: "runtime", value: typeof task.runtime === "number" ? `${task.runtime.toFixed(2)}s` : "—" },
                    { key: "retries", value: task.retries },
                    { key: "startedAt", value: taskTime(task.startedAt, i18n.language) },
                    { key: "finishedAt", value: taskTime(task.finishedAt, i18n.language) },
                  ].map((field) => (
                    <div key={field.key} className="grid min-w-0 gap-1 sm:grid-cols-[140px_1fr]">
                      <dt className="text-muted-foreground">{t(`task.${field.key}`)}</dt>
                      <dd className="min-w-0 wrap-anywhere">{field.value}</dd>
                    </div>
                  ))}
                </dl>
                <PythonArgumentsViewer
                  key={task.taskId}
                  value={{ args: task.args, kwargs: task.kwargs }}
                  functionName={task.taskName}
                />
                {task.result !== null && task.result !== undefined && (
                  <JsonViewer value={task.result} title={t("task.result")} filename={`task-${id}-result.json`} />
                )}
                <TaskFailure
                  key={JSON.stringify([task.taskId, task.exception, task.traceback])}
                  id={id}
                  status={task.status}
                  exception={task.exception}
                  traceback={task.traceback}
                />
                {task.logs && (
                  <LogViewer log={task.logs} sourceKey={id} title={t("task.logs")} filename={`task-${id}.log`} />
                )}
              </>
            )
          )}
        </div>
        <SheetFooter className="border-t p-4">
          <Button variant="outline" onClick={onClose}>
            {t("task.close")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
