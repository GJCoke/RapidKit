import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button, Input } from "@rapidkit/ui"
import { FormSelect } from "@/shared/crud/form-select"
import {
  normalizeLogs,
  retainEntries,
  filterEntries,
  formatEntry,
  structuredAdditions,
  positiveInteger,
  type LogLevel,
  type LogViewerProps,
} from "./log-model"
import { LogContent } from "./log-content"
import { TextActions } from "./code-preview"
export function LogViewer({
  log,
  records,
  sourceKey,
  title,
  loading,
  error,
  height,
  maxEntries,
  filename = "logs.log",
  wrap: initialWrap = true,
  showLineNumbers = true,
  follow: initialFollow = true,
}: LogViewerProps) {
  const { t } = useTranslation(),
    all = useMemo(() => normalizeLogs(log, records), [log, records]),
    retained = useMemo(() => retainEntries(all, maxEntries), [all, maxEntries]),
    [query, setQuery] = useState(""),
    [level, setLevel] = useState<LogLevel | "">(""),
    [wrap, setWrap] = useState(initialWrap),
    [numbers, setNumbers] = useState(showLineNumbers),
    [follow, setFollow] = useState(initialFollow),
    [pending, setPending] = useState(0),
    [lost, setLost] = useState(false)
  const [previous, setPrevious] = useState({ all, log, sourceKey, maxEntries, structured: records !== undefined })
  if (previous.all !== all || previous.sourceKey !== sourceKey || previous.maxEntries !== maxEntries) {
    let added = null
    if (previous.sourceKey === sourceKey && previous.structured === (records !== undefined)) {
      if (records !== undefined) added = structuredAdditions(previous.all, all)
      else if ((log ?? "").startsWith(previous.log ?? "")) added = all.slice(previous.all.length)
    }
    setPrevious({ all, log, sourceKey, maxEntries, structured: records !== undefined })
    if (added === null) {
      setFollow(true)
      setPending(0)
      setLost(false)
    } else if (previous.maxEntries !== maxEntries) {
      setPending(0)
    } else if (!follow) {
      const ids = new Set(retained.entries.map((entry) => entry.id))
      setPending(
        pending +
          filterEntries(
            added.filter((entry) => ids.has(entry.id)),
            query,
            records !== undefined ? level : "",
          ).length,
      )
    }
  }
  const visible = filterEntries(retained.entries, query, records !== undefined ? level : ""),
    text = visible.map(formatEntry).join("\n"),
    label = title ?? t("logViewer.title")
  function changeFollow(next: boolean) {
    setFollow(next)
    if (next) {
      setPending(0)
      setLost(false)
    }
  }
  return (
    <section className="min-w-0 overflow-hidden rounded-lg border" aria-label={label}>
      <div className="flex flex-wrap justify-between gap-2 border-b p-3">
        <h3 className="font-medium">{label}</h3>
        {loading && <span role="status">{t("logViewer.loading")}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 p-3">
        <Input
          className="min-w-0 flex-[1_1_180px]"
          aria-label={t("logViewer.search")}
          placeholder={t("logViewer.search")}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setPending(0)
            setLost(false)
          }}
        />
        {records !== undefined && (
          <div className="w-36 max-w-full">
            <FormSelect
              label={t("logViewer.level")}
              value={level}
              options={[
                { value: "", label: t("logViewer.allLevels") },
                ...(["DEBUG", "INFO", "WARN", "ERROR"] as const).map((value) => ({ value, label: value })),
              ]}
              onChange={(next) => {
                if (next === "" || next === "DEBUG" || next === "INFO" || next === "WARN" || next === "ERROR") {
                  setLevel(next)
                  setPending(0)
                  setLost(false)
                }
              }}
            />
          </div>
        )}
        <Button
          type="button"
          size="sm"
          variant={follow ? "default" : "outline"}
          aria-pressed={follow}
          onClick={() => changeFollow(!follow)}
        >
          {t("logViewer.follow")}
        </Button>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={wrap} onChange={(event) => setWrap(event.target.checked)} />
          {t("logViewer.wrap")}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={numbers} onChange={(event) => setNumbers(event.target.checked)} />
          {t("logViewer.lineNumbers")}
        </label>
        <TextActions
          key={`${sourceKey}:${text}`}
          code={text}
          namespace="logViewer"
          filename={filename}
          disabled={!visible.length}
        />
      </div>
      {error && (
        <p role="alert" className="p-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {visible.length ? (
        <LogContent
          entries={visible}
          retained={retained.entries}
          height={positiveInteger(height, 360)}
          wrap={wrap}
          numbers={numbers}
          follow={follow}
          label={label}
          onFollow={changeFollow}
          onLost={() => setLost(true)}
        />
      ) : (
        <div
          className="grid place-items-center p-3 text-sm text-muted-foreground"
          style={{ height: positiveInteger(height, 360) }}
        >
          {loading
            ? t("logViewer.loading")
            : !error
              ? t(retained.entries.length ? "logViewer.noMatches" : "logViewer.empty")
              : null}
        </div>
      )}
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t p-3 text-xs text-muted-foreground">
        <span>{t("logViewer.count", { visible: visible.length, total: retained.entries.length })}</span>
        {retained.omitted > 0 && (
          <span>{t("logViewer.truncated", { count: retained.entries.length, omitted: retained.omitted })}</span>
        )}
        {lost && <span role="status">{t("logViewer.anchorLost")}</span>}
        {follow ? (
          <span>{t("logViewer.following")}</span>
        ) : (
          <Button type="button" variant="ghost" size="sm" onClick={() => changeFollow(true)}>
            {t(pending ? "logViewer.newEntries" : "logViewer.bottom", { count: pending })}
          </Button>
        )}
      </footer>
    </section>
  )
}
