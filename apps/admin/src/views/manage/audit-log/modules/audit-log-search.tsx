import { Alert, AlertDescription } from "@rapidkit/ui/components/alert"
import { useState } from "react"
import { dayjs } from "../audit-log-time"
import { useTranslation } from "react-i18next"
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  FieldGroup,
  Input,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@rapidkit/ui"
import type { AuditCatalog, AuditLogQuery } from "@/services/api/audit-log"
import { useAuditActors } from "@/services/hooks/use-audit-log"
import { FormField } from "@/shared/crud"
import { auditUuidPattern, parseAuditLogQuery, type AuditLogPageState } from "../audit-log-query"
export function AuditSelect({
  label,
  value,
  items,
  onChange,
  disabled,
}: {
  label: string
  value?: string | null
  items: Array<{ value: string; label: string }>
  onChange: (value: string | undefined) => void
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const options = [{ value: "", label: t("audit.allOptions") }, ...items]
  if (value && !options.some((item) => item.value === value)) options.push({ value, label: value })
  return (
    <FormField label={label}>
      <Select items={options} value={value ?? ""} onValueChange={(v) => onChange(v || undefined)} disabled={disabled}>
        <SelectTrigger aria-label={label} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </FormField>
  )
}
const advancedTextFields = [
  "resourceKeyword",
  "resourceId",
  "requestId",
  "correlationId",
  "subjectUserId",
  "impersonationSessionId",
  "ip",
  "actorKeyword",
] as const
const filterLabels: Record<string, string> = {
  resourceKeyword: "resourceName",
  actorKeyword: "actorAccount",
  subjectUserId: "detail.subjectId",
  impersonationSessionId: "detail.sessionId",
  startTime: "fromTime",
  endTime: "toTime",
  result: "resultLabel",
  riskLevel: "riskLabel",
  source: "sourceLabel",
  actorId: "actor",
}
export function auditFilterLabel(key: string) {
  return filterLabels[key] ?? key
}
export function AuditLogSearch({
  state,
  catalog,
  onApply,
}: {
  state: AuditLogPageState
  catalog: AuditCatalog | undefined
  onApply: (filters: AuditLogQuery, range: AuditLogPageState["timeRange"]) => void
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(state.filters)
  const [range, setRange] = useState(state.timeRange)
  const [help, setHelp] = useState(false)
  const [expanded, setExpanded] = useState(
    advancedTextFields.some((key) => !!draft[key]) ||
      !!draft.action ||
      !!draft.actorId ||
      !!draft.resourceType ||
      !!draft.source ||
      !!draft.riskLevel,
  )
  const [actorKeyword, setActorKeyword] = useState("")
  const [optionSearch, setOptionSearch] = useState("")
  const [rangeError, setRangeError] = useState(false)
  const [identifierError, setIdentifierError] = useState(false)
  const zone = catalog?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
  const actors = useAuditActors({ keyword: actorKeyword, startTime: draft.startTime, endTime: draft.endTime })
  const apply = (filters: AuditLogQuery, nextRange = range) => {
    const invalidIdentity = (["actorId", "subjectUserId", "impersonationSessionId"] as const).some((key) => {
      const value = filters[key]
      return !!value && !auditUuidPattern.test(value.trim())
    })
    setIdentifierError(invalidIdentity)
    if (invalidIdentity) return
    const hasTime = !!filters.startTime || !!filters.endTime
    if (
      hasTime &&
      (!filters.startTime ||
        !filters.endTime ||
        !dayjs(filters.startTime).isValid() ||
        !dayjs(filters.endTime).isAfter(filters.startTime))
    ) {
      setRangeError(true)
      return
    }
    setRangeError(false)
    onApply(filters, nextRange)
  }
  const resources = [
    ...new Map(
      (catalog?.actions ?? []).map((action) => [
        action.resourceType,
        { value: action.resourceType, label: action.resourceLabel },
      ]),
    ).values(),
  ].filter((item) => `${item.value} ${item.label}`.toLowerCase().includes(optionSearch.toLowerCase()))
  const actions = (catalog?.actions ?? [])
    .filter(
      (action) =>
        (!draft.resourceType || action.resourceType === draft.resourceType) &&
        `${action.code} ${action.label}`.toLowerCase().includes(optionSearch.toLowerCase()),
    )
    .map((action) => ({ value: action.code, label: `${action.label} · ${action.code}` }))
  const selectRange = (preset: "24h" | "today" | "7d" | "all") => {
    const now = dayjs().tz(zone),
      nextRange = preset === "all" ? "all" : preset === "24h" ? "24h" : "custom"
    const next = {
      ...draft,
      startTime:
        preset === "all"
          ? undefined
          : (preset === "today" ? now.startOf("day") : now.subtract(preset === "7d" ? 168 : 24, "hour")).toISOString(),
      endTime: preset === "all" ? undefined : now.toISOString(),
    }
    setDraft(next)
    setRange(nextRange)
    apply(next, nextRange)
  }
  const set = (key: keyof AuditLogQuery, value: string | undefined) =>
    setDraft((current) => ({ ...current, [key]: value }))
  const signature = (value: AuditLogQuery) =>
    JSON.stringify(
      Object.entries(value)
        .filter(([key, v]) => key !== "page" && key !== "pageSize" && v !== undefined && v !== null && v !== "")
        .sort(([a], [b]) => a.localeCompare(b)),
    )
  const views = ["all", "attention", "impersonation", "system"] as const
  return (
    <section className="grid gap-4 rounded-lg border p-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => setHelp(true)}>
          {t("audit.recordHelp")}
        </Button>
      </div>
      <Tabs
        value={draft.view ?? "all"}
        onValueChange={(value) => {
          const view = views.find((item) => item === value)
          if (view) {
            const next = { ...draft, view }
            setDraft(next)
            apply(next)
          }
        }}
      >
        <TabsList
          aria-label={t("audit.viewLabel")}
          className="group-data-[orientation=horizontal]/tabs:h-auto flex-wrap"
        >
          {views.map((view) => (
            <TabsTrigger key={view} value={view} className="h-7">
              {t(`audit.views.${view}`)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <div className="flex flex-wrap items-center gap-2">
        <span>{t("audit.timeRange")}</span>
        {(["24h", "today", "7d", "all"] as const).map((preset) => (
          <Button key={preset} size="sm" variant="outline" onClick={() => selectRange(preset)}>
            {t(`audit.ranges.${preset}`)}
          </Button>
        ))}
        <span className="text-xs text-muted-foreground">
          {t("audit.displayTimezone")}: {zone}
        </span>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          apply(draft)
        }}
        className="grid gap-4"
      >
        <FieldGroup className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FormField htmlFor="audit-keyword" label={t("audit.keyword")}>
            <Input
              id="audit-keyword"
              maxLength={200}
              placeholder={t("audit.keywordPlaceholder")}
              value={draft.keyword ?? ""}
              onChange={(event) => set("keyword", event.target.value)}
            />
          </FormField>
          {(["startTime", "endTime"] as const).map((key) => (
            <FormField
              key={key}
              label={t(`audit.${auditFilterLabel(key)}`)}
              htmlFor={`audit-${key}`}
              error={rangeError ? t("audit.invalidRange") : undefined}
            >
              <Input
                id={`audit-${key}`}
                type="datetime-local"
                step="1"
                aria-invalid={rangeError}
                value={draft[key] ? dayjs(draft[key]).tz(zone).format("YYYY-MM-DDTHH:mm:ss") : ""}
                onChange={(event) => {
                  const value = event.target.value ? dayjs.tz(event.target.value, zone).toISOString() : undefined
                  const next = { ...draft, [key]: value }
                  setDraft(next)
                  setRange(next.startTime || next.endTime ? "custom" : "all")
                }}
              />
            </FormField>
          ))}
          <AuditSelect
            label={t("audit.resultLabel")}
            value={draft.result}
            items={(["success", "failure", "partial", "unknown"] as const).map((value) => ({
              value,
              label: t(`audit.result.${value}`),
            }))}
            onChange={(v) => set("result", v)}
          />
        </FieldGroup>
        <details open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)}>
          <summary className="cursor-pointer py-2 font-medium">{t("audit.advancedSearch")}</summary>
          <FieldGroup className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <FormField htmlFor="audit-actor-search" label={t("audit.searchActor")}>
              <Input
                id="audit-actor-search"
                maxLength={100}
                value={actorKeyword}
                onChange={(event) => setActorKeyword(event.target.value)}
              />
            </FormField>
            <AuditSelect
              label={t("audit.actor")}
              value={draft.actorId}
              disabled={actors.isPending || actors.isError}
              items={(actors.data ?? []).map((actor) => ({
                value: actor.id,
                label:
                  actor.name && actor.username
                    ? `${actor.name} (${actor.username})`
                    : actor.name || actor.username || actor.id,
              }))}
              onChange={(v) => set("actorId", v)}
            />
            <FormField htmlFor="audit-option-search" label={t("audit.searchOption")}>
              <Input
                id="audit-option-search"
                value={optionSearch}
                onChange={(event) => setOptionSearch(event.target.value)}
              />
            </FormField>
            <AuditSelect
              label={t("audit.resourceType")}
              value={draft.resourceType}
              items={resources}
              onChange={(v) => setDraft({ ...draft, resourceType: v, action: undefined })}
            />
            <AuditSelect
              label={t("audit.action")}
              value={draft.action}
              items={actions}
              onChange={(v) => set("action", v)}
            />
            {advancedTextFields.map((key) => (
              <FormField key={key} htmlFor={`audit-${key}`} label={t(`audit.${auditFilterLabel(key)}`)}>
                <Input
                  id={`audit-${key}`}
                  maxLength={key === "ip" ? 45 : key === "resourceKeyword" ? 200 : 100}
                  value={draft[key] ?? ""}
                  onChange={(event) => set(key, event.target.value)}
                />
              </FormField>
            ))}
            <AuditSelect
              label={t("audit.riskLabel")}
              value={draft.riskLevel}
              items={(["normal", "sensitive", "critical"] as const).map((value) => ({
                value,
                label: t(`audit.risk.${value}`),
              }))}
              onChange={(v) => set("riskLevel", v)}
            />
            <AuditSelect
              label={t("audit.sourceLabel")}
              value={draft.source}
              items={(["http", "domain_event", "system"] as const).map((value) => ({
                value,
                label: t(`audit.source.${value}`),
              }))}
              onChange={(v) => set("source", v)}
            />
          </FieldGroup>
        </details>
        {identifierError && (
          <Alert variant="destructive">
            <AlertDescription>{t("audit.invalidIdentifier")}</AlertDescription>
          </Alert>
        )}
        {actors.isError && (
          <Alert variant="destructive">
            <AlertDescription>
              {t("audit.optionsFailed")}
              <Button type="button" variant="outline" size="sm" onClick={() => void actors.refetch()}>
                {t("datatable.retry")}
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {signature(draft) !== signature(state.filters) && (
          <p role="status" className="text-muted-foreground">
            {t("audit.filtersPending")}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              const next = parseAuditLogQuery({}).filters
              setDraft(next)
              setRange("24h")
              apply(next, "24h")
            }}
          >
            {t("common.reset")}
          </Button>
          <Button type="submit">{t("common.search")}</Button>
        </div>
      </form>
      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("audit.recordHelp")}</DialogTitle>
            <DialogDescription>{t("audit.introduction")}</DialogDescription>
          </DialogHeader>
          {(["coverage", "delay", "results", "risk", "absence", "privacy"] as const).map((topic) => (
            <section key={topic}>
              <h3 className="font-medium">{t(`audit.help.${topic}.title`)}</h3>
              <p className="text-muted-foreground">{t(`audit.help.${topic}.text`)}</p>
            </section>
          ))}
        </DialogContent>
      </Dialog>
    </section>
  )
}
