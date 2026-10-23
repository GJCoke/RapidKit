import { useTranslation } from "react-i18next"
import { Button, Skeleton } from "@rapidkit/ui"
import type { SchedulePreview } from "@/services/api/schedule"
import { displayScheduleTime } from "./schedule-model"
export function SchedulePreviewPanel({
  preview,
  loading,
  failed,
  invalid,
  hint,
  precise = false,
  disabled = false,
  onRefresh,
}: {
  preview?: SchedulePreview
  loading: boolean
  failed: boolean
  invalid: boolean
  hint?: string
  precise?: boolean
  disabled?: boolean
  onRefresh: () => void
}) {
  const { t } = useTranslation(),
    runs = preview?.nextRuns ?? []
  return (
    <section className="min-w-0 space-y-3" aria-busy={loading}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="min-w-0 text-sm font-medium">
          {t("crontabEditor.nextRuns")}{" "}
          {preview && <span className="break-all text-xs text-muted-foreground">{preview.timezone}</span>}
        </h4>
        <Button type="button" variant="outline" size="sm" disabled={disabled || loading || invalid} onClick={onRefresh}>
          {t("crontabEditor.refresh")}
        </Button>
      </header>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {failed ? (
        <p role="alert" className="text-sm text-amber-700 dark:text-amber-300">
          {t("crontabEditor.previewFailed")}
        </p>
      ) : invalid ? (
        <p className="text-xs text-muted-foreground">{t("crontabEditor.fixBeforePreview")}</p>
      ) : loading || !preview ? (
        <ol className="space-y-2 rounded-md border p-3" aria-hidden>
          {Array.from({ length: 5 }, (_, index) => (
            <li key={index}>
              <Skeleton className="h-5 w-full" />
            </li>
          ))}
        </ol>
      ) : (
        <>
          <ol className="divide-y rounded-md border">
            {runs.map((run, index) => (
              <li key={run} className="flex min-w-0 items-start gap-3 p-3 text-xs">
                <span className="shrink-0 text-muted-foreground">{index + 1}</span>
                <time dateTime={run} title={run} className="min-w-0 font-mono wrap-anywhere tabular-nums">
                  {displayScheduleTime(run, precise)}
                </time>
              </li>
            ))}
          </ol>
          {runs.length < 5 && (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              {t("crontabEditor.horizon", { years: preview.horizonYears })}
            </p>
          )}
          <p className="text-xs wrap-anywhere text-muted-foreground">
            {t("crontabEditor.evaluatedAt", {
              time: displayScheduleTime(preview.evaluatedAt, precise),
              timezone: preview.timezone,
            })}
          </p>
          {!preview.valid && (
            <p role="alert" className="text-sm text-destructive">
              {t("scheduleEditor.invalid")}
            </p>
          )}
        </>
      )}
    </section>
  )
}
