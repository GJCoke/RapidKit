import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Button, Input, Textarea } from "@rapidkit/ui"
import { FormSelect } from "@/shared/crud/form-select"
import { TextActions } from "@/shared/code-viewers/code-preview"
import { cronFields, cronModes, encodeCron, formatCron, minuteIntervals, type CronMode } from "./cron-model"
import {
  scheduleTypes,
  intervalPeriods,
  solarEvents,
  selectSchedule,
  encodeSchedule,
  type ScheduleDraft,
} from "./schedule-model"
import type { useSchedulePreview } from "./use-schedule-preview"
import { SchedulePreviewPanel } from "./preview-panel"
interface Props {
  value: ScheduleDraft
  onChange: (value: ScheduleDraft) => void
  preview: ReturnType<typeof useSchedulePreview>
  disabled?: boolean
}
const weekdays = [1, 2, 3, 4, 5, 6, 0] as const,
  weekdayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const
function numberInput(value: string) {
  return value.trim() === "" ? null : Number(value)
}
export function ScheduleEditor({ value, onChange, preview, disabled = false }: Props) {
  const { t } = useTranslation(),
    kind = value.kind,
    encoded = encodeSchedule(value),
    cron = encodeCron(value.crontab),
    expression = cron.value ? formatCron(cron.value) : ""
  const error = encoded.error
    ? kind === "crontab"
      ? t(`crontabEditor.error.${encoded.error}`)
      : t(kind === "interval" ? "scheduleEditor.intervalError" : "scheduleEditor.solarError")
    : kind === "crontab" && preview.preview && !preview.preview.valid
      ? t("crontabEditor.error.invalidField", {
          field: cronFields.find((field) => field === preview.preview?.errorField)
            ? t(`crontabEditor.fields.${preview.preview.errorField}`)
            : t("crontabEditor.expression"),
        })
      : ""
  function change(next: ScheduleDraft) {
    if (!disabled) onChange(next)
  }
  function cronPatch(patch: Partial<ScheduleDraft["crontab"]>) {
    change({ ...value, crontab: { ...value.crontab, ...patch } })
  }
  function setMode(mode: CronMode) {
    cronPatch({
      mode,
      expression: mode === "advanced" && cron.value ? formatCron(cron.value) : value.crontab.expression,
    })
  }
  function toggle(group: "weekdays" | "monthDays", day: number) {
    const current = value.crontab[group]
    cronPatch({ [group]: current.includes(day) ? current.filter((selected) => selected !== day) : [...current, day] })
  }
  const field = (label: string, element: ReactNode) => (
    <label className="grid min-w-0 gap-1 text-sm">
      {label}
      {element}
    </label>
  )
  const solar = value.solar,
    coordinates =
      solar.latitude !== null && solar.longitude !== null
        ? `${Math.abs(solar.latitude)}° ${t(solar.latitude < 0 ? "scheduleEditor.south" : "scheduleEditor.north")} · ${Math.abs(solar.longitude)}° ${t(solar.longitude < 0 ? "scheduleEditor.west" : "scheduleEditor.east")}`
        : ""
  const summaryParams = {
    count: value.crontab.interval,
    minute: String(value.crontab.minute).padStart(2, "0"),
    time: value.crontab.time,
    days:
      value.crontab.mode === "weekly"
        ? weekdays
            .filter((day) => value.crontab.weekdays.includes(day))
            .map((day) => t(`crontabEditor.weekdays.${weekdayKeys[day]}`))
            .join(t("crontabEditor.separator"))
        : [...value.crontab.monthDays].sort((a, b) => a - b).join(t("crontabEditor.separator")),
  }
  return (
    <div className="min-w-0 space-y-3">
      <div className="grid grid-cols-3 gap-2" role="group" aria-label={t("scheduleEditor.title")}>
        {scheduleTypes.map((type) => (
          <Button
            type="button"
            key={type}
            variant={kind === type ? "default" : "outline"}
            aria-pressed={kind === type}
            disabled={disabled}
            className="h-auto min-h-12 whitespace-normal px-2 py-2 text-xs"
            onClick={() => change(selectSchedule(value, type))}
          >
            {t(`scheduleEditor.types.${type}`)}
          </Button>
        ))}
      </div>
      <section
        className="min-w-0 space-y-4 rounded-lg border p-4"
        aria-label={t(kind === "crontab" ? "crontabEditor.title" : `scheduleEditor.types.${kind}`)}
      >
        <h3 className="text-sm font-semibold">
          {t(kind === "crontab" ? "crontabEditor.title" : `scheduleEditor.types.${kind}`)}
        </h3>
        {kind === "interval" ? (
          <>
            <div className="grid min-w-0 grid-cols-2 gap-3">
              {field(
                t("scheduleEditor.every"),
                <Input
                  type="number"
                  min={1}
                  max={2147483647}
                  step={1}
                  aria-label={t("scheduleEditor.every")}
                  value={value.interval.every ?? ""}
                  disabled={disabled}
                  onChange={(event) =>
                    change({ ...value, interval: { ...value.interval, every: numberInput(event.target.value) } })
                  }
                />,
              )}
              {field(
                t("scheduleEditor.unit"),
                <FormSelect
                  label={t("scheduleEditor.unit")}
                  value={value.interval.period}
                  disabled={disabled}
                  options={intervalPeriods.map((value) => ({ value, label: t(`scheduleEditor.periods.${value}`) }))}
                  onChange={(next) => {
                    const period = intervalPeriods.find((period) => period === next)
                    if (period) change({ ...value, interval: { ...value.interval, period } })
                  }}
                />,
              )}
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label={t("scheduleEditor.presets")}>
              {(
                [
                  { every: 30, period: "seconds" },
                  { every: 5, period: "minutes" },
                  { every: 15, period: "minutes" },
                  { every: 1, period: "hours" },
                ] as const
              ).map((preset) => (
                <Button
                  type="button"
                  key={`${preset.every}-${preset.period}`}
                  size="sm"
                  variant="outline"
                  disabled={disabled}
                  onClick={() => change({ ...value, interval: { ...preset } })}
                >
                  {preset.every} {t(`scheduleEditor.periods.${preset.period}`)}
                </Button>
              ))}
            </div>
          </>
        ) : kind === "solar" ? (
          <>
            {field(
              t("scheduleEditor.event"),
              <FormSelect
                label={t("scheduleEditor.event")}
                value={solar.event}
                disabled={disabled}
                options={solarEvents.map((value) => ({ value, label: t(`scheduleEditor.events.${value}`) }))}
                onChange={(next) => {
                  const event = solarEvents.find((event) => event === next)
                  if (event) change({ ...value, solar: { ...solar, event } })
                }}
              />,
            )}
            <p className="text-xs text-muted-foreground">{t(`scheduleEditor.eventHints.${solar.event}`)}</p>
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              {(["latitude", "longitude"] as const).map((key) => (
                <div key={key} className="min-w-0 space-y-1">
                  {field(
                    t(`scheduleEditor.${key}`),
                    <Input
                      type="number"
                      min={key === "latitude" ? -90 : -180}
                      max={key === "latitude" ? 90 : 180}
                      step="0.0001"
                      aria-label={t(`scheduleEditor.${key}`)}
                      value={solar[key] ?? ""}
                      disabled={disabled}
                      onChange={(event) =>
                        change({ ...value, solar: { ...solar, [key]: numberInput(event.target.value) } })
                      }
                    />,
                  )}
                  <p className="text-xs text-muted-foreground">{t(`scheduleEditor.${key}Hint`)}</p>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2" role="group" aria-label={t("crontabEditor.frequency")}>
              {cronModes.map((mode) => (
                <Button
                  type="button"
                  key={mode}
                  variant={value.crontab.mode === mode ? "default" : "outline"}
                  aria-pressed={value.crontab.mode === mode}
                  disabled={disabled}
                  className="h-auto min-h-10 whitespace-normal px-2 py-2 text-xs"
                  onClick={() => setMode(mode)}
                >
                  {t(`crontabEditor.modes.${mode}`)}
                </Button>
              ))}
            </div>
            {value.crontab.mode === "minutes" ? (
              <>
                {field(
                  t("crontabEditor.interval"),
                  <FormSelect
                    label={t("crontabEditor.interval")}
                    value={String(value.crontab.interval)}
                    disabled={disabled}
                    options={minuteIntervals.map((value) => ({
                      value: String(value),
                      label: t("crontabEditor.minuteOption", { count: value }),
                    }))}
                    onChange={(next) => cronPatch({ interval: Number(next) })}
                  />,
                )}
                <p className="text-xs text-muted-foreground">{t("crontabEditor.clockAligned")}</p>
              </>
            ) : value.crontab.mode === "hourly" ? (
              field(
                t("crontabEditor.hourMinute"),
                <FormSelect
                  label={t("crontabEditor.hourMinute")}
                  value={String(value.crontab.minute)}
                  disabled={disabled}
                  options={Array.from({ length: 60 }, (_, value) => ({
                    value: String(value),
                    label: String(value).padStart(2, "0"),
                  }))}
                  onChange={(next) => cronPatch({ minute: Number(next) })}
                />,
              )
            ) : value.crontab.mode === "advanced" ? (
              <>
                {field(
                  t("crontabEditor.expression"),
                  <Textarea
                    rows={2}
                    aria-label={t("crontabEditor.expression")}
                    value={value.crontab.expression}
                    disabled={disabled}
                    placeholder="30 9 * * 1-5"
                    className="font-mono"
                    onChange={(event) => cronPatch({ expression: event.target.value })}
                  />,
                )}
                <p className="text-xs text-muted-foreground">{t("crontabEditor.advancedHint")}</p>
              </>
            ) : (
              <>
                {value.crontab.mode === "weekly" && (
                  <>
                    <div
                      className="grid grid-cols-4 gap-2 sm:grid-cols-7"
                      role="group"
                      aria-label={t("crontabEditor.selectWeekdays")}
                    >
                      {weekdays.map((day) => (
                        <Button
                          type="button"
                          key={day}
                          size="sm"
                          variant={value.crontab.weekdays.includes(day) ? "default" : "outline"}
                          aria-pressed={value.crontab.weekdays.includes(day)}
                          disabled={disabled}
                          onClick={() => toggle("weekdays", day)}
                        >
                          {t(`crontabEditor.weekdays.${weekdayKeys[day]}`)}
                        </Button>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { key: "workdays", days: [1, 2, 3, 4, 5] },
                        { key: "weekend", days: [6, 0] },
                        { key: "everyDay", days: [...weekdays] },
                      ].map((preset) => (
                        <Button
                          type="button"
                          key={preset.key}
                          size="sm"
                          variant="outline"
                          disabled={disabled}
                          onClick={() => cronPatch({ weekdays: preset.days })}
                        >
                          {t(`crontabEditor.${preset.key}`)}
                        </Button>
                      ))}
                    </div>
                  </>
                )}
                {value.crontab.mode === "monthly" && (
                  <>
                    <div
                      className="grid grid-cols-5 gap-2 sm:grid-cols-7"
                      role="group"
                      aria-label={t("crontabEditor.selectDays")}
                    >
                      {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
                        <Button
                          type="button"
                          key={day}
                          size="sm"
                          variant={value.crontab.monthDays.includes(day) ? "default" : "outline"}
                          disabled={disabled}
                          aria-pressed={value.crontab.monthDays.includes(day)}
                          aria-label={t("crontabEditor.dateOption", { day })}
                          onClick={() => toggle("monthDays", day)}
                        >
                          {day}
                        </Button>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">{t("crontabEditor.monthHint")}</p>
                  </>
                )}
                {field(
                  t("crontabEditor.time"),
                  <Input
                    type="time"
                    step={60}
                    aria-label={t("crontabEditor.time")}
                    value={value.crontab.time ?? ""}
                    disabled={disabled}
                    onChange={(event) => cronPatch({ time: event.target.value || null })}
                  />,
                )}
              </>
            )}
          </>
        )}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : (
          <p aria-live="polite" className="rounded-md bg-muted/50 p-3 text-sm">
            {kind === "interval"
              ? t("scheduleEditor.intervalSummary", {
                  count: value.interval.every ?? undefined,
                  unit: t(`scheduleEditor.periods.${value.interval.period}`),
                })
              : kind === "solar"
                ? t("scheduleEditor.solarSummary", { event: t(`scheduleEditor.events.${solar.event}`), coordinates })
                : t(`crontabEditor.summary.${value.crontab.mode}`, summaryParams)}
          </p>
        )}
        {kind === "crontab" && (
          <section className="min-w-0 space-y-2" aria-label={t("crontabEditor.expression")}>
            <header className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-medium">{t("crontabEditor.expression")}</h4>
              <TextActions key={expression} code={expression} namespace="pythonArguments" disabled={!expression} />
            </header>
            <div
              className="grid min-w-0 grid-cols-5 divide-x rounded-md border bg-muted/30"
              aria-label={expression || t("crontabEditor.emptyExpression")}
            >
              {cronFields.map((field) => (
                <div key={field} className="min-w-0 p-2 text-center">
                  <code
                    className={`block wrap-anywhere ${preview.preview?.errorField === field ? "text-destructive" : ""}`}
                  >
                    {cron.value?.[field] ?? "—"}
                  </code>
                  <span className="block text-xs text-muted-foreground">{t(`crontabEditor.fields.${field}`)}</span>
                </div>
              ))}
            </div>
          </section>
        )}
        <SchedulePreviewPanel
          preview={preview.preview}
          loading={preview.loading}
          failed={preview.failed}
          invalid={Boolean(error)}
          disabled={disabled}
          precise={
            kind === "interval" &&
            (value.interval.period === "microseconds" || value.interval.period === "milliseconds")
          }
          hint={
            kind === "interval"
              ? t("scheduleEditor.intervalHint")
              : kind === "solar"
                ? t("scheduleEditor.solarHint")
                : undefined
          }
          onRefresh={() => {
            if (!disabled) void preview.refresh()
          }}
        />
      </section>
    </div>
  )
}
