import { Alert, AlertDescription, AlertTitle } from "@rapidkit/ui/components/alert"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import {
  Badge,
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Skeleton,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  toast,
} from "@rapidkit/ui"
import type { AuditCatalog, AuditDetail, AuditLogQuery } from "@/services/api/audit-log"
import { useAuditDetail, useAuditLogs, useAuditTargets } from "@/services/hooks/use-audit-log"
import { DataTablePagination } from "@/shared/data-table"
import {
  auditActionLabel,
  auditChangeValue,
  auditIdentity,
  auditNoChangesKey,
  auditResourceLabel,
  auditValue,
  formatAuditTime,
  getAuditResultPresentation,
} from "../audit-log-display"
export function AuditResultBadge({ result }: { result: string }) {
  const { t } = useTranslation()
  const display = getAuditResultPresentation(result)
  return <Badge variant={display.type}>{t(display.key)}</Badge>
}
function AuditRetry({ retry }: { retry: () => void }) {
  const { t } = useTranslation()
  return (
    <Alert variant="destructive">
      <AlertDescription>
        {t("audit.loadFailed")}
        <Button variant="outline" size="sm" onClick={retry}>
          {t("datatable.retry")}
        </Button>
      </AlertDescription>
    </Alert>
  )
}
function AuditTargets({ id, onRelated }: { id: string; onRelated: (filters: AuditLogQuery) => void }) {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const query = useAuditTargets(id, page)
  return (
    <section aria-label={t("audit.batchTargets")} className="grid gap-3">
      <h3 className="font-medium">{t("audit.batchTargets")}</h3>
      {query.isPending ? (
        <Skeleton className="h-20 w-full" />
      ) : query.isError ? (
        <AuditRetry retry={() => void query.refetch()} />
      ) : (
        <>
          <ul className="grid gap-2">
            {query.data?.records.map((target) => (
              <li key={target.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                <div className="min-w-0 break-all">
                  <p>{target.resourceName || target.resourceId}</p>
                  <p className="text-xs text-muted-foreground">
                    {target.resourceType} · {target.resourceId}
                  </p>
                </div>
                <AuditResultBadge result={target.result} />
                {target.errorMessage && <span className="break-all text-destructive">{target.errorMessage}</span>}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onRelated({ resourceType: target.resourceType, resourceId: target.resourceId })}
                >
                  {t("audit.sameResource")}
                </Button>
              </li>
            ))}
          </ul>
          <DataTablePagination
            page={page}
            pageSize={20}
            total={query.data?.total ?? 0}
            pageSizes={[20]}
            onPageChange={setPage}
            onPageSizeChange={() => {}}
          />
        </>
      )}
    </section>
  )
}
function RelatedRecords({
  filters,
  catalog,
  onOpen,
  onClose,
}: {
  filters: AuditLogQuery
  catalog: AuditCatalog | undefined
  onOpen: (id: string) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const query = useAuditLogs({ ...filters, page, pageSize: 10 })
  return (
    <section aria-label={t("audit.related")} className="grid gap-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground">{t("audit.relatedAllTime")}</p>
        <Button size="sm" variant="ghost" onClick={onClose}>
          {t("audit.closeRelated")}
        </Button>
      </div>
      {query.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : query.isError ? (
        <AuditRetry retry={() => void query.refetch()} />
      ) : (
        <>
          <ul className="grid gap-3">
            {query.data?.records.map((row) => (
              <li key={row.id} className="grid gap-2 border-l-2 pl-3">
                <p>{auditActionLabel(row.action, catalog, t)}</p>
                <p className="text-xs text-muted-foreground">{formatAuditTime(row.occurredAt, catalog?.timezone)}</p>
                <p>{auditIdentity(row) || t(`audit.identity.${row.actorType}`)}</p>
                <p>{auditResourceLabel(row, t)}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <AuditResultBadge result={row.result} />
                  <Button variant="outline" size="sm" onClick={() => onOpen(row.id)}>
                    {t("audit.openEvent")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          {!query.data?.records.length && <p>{t("audit.noRelated")}</p>}
          {(query.data?.total ?? 0) > 10 && (
            <DataTablePagination
              page={page}
              pageSize={10}
              pageSizes={[10]}
              total={query.data?.total ?? 0}
              onPageChange={setPage}
              onPageSizeChange={() => {}}
            />
          )}
        </>
      )}
    </section>
  )
}
function AuditDetailBody({
  detail,
  catalog,
  onOpen,
}: {
  detail: AuditDetail
  catalog: AuditCatalog | undefined
  onOpen: (id: string) => void
}) {
  const { t } = useTranslation()
  const [related, setRelated] = useState<AuditLogQuery | null>(null)
  const action = catalog?.actions.find((item) => item.code === detail.action)
  const resource = auditResourceLabel(detail, t)
  const actionLabel = auditActionLabel(detail.action, catalog, t)
  let actor = auditIdentity(detail) || t(`audit.identity.${detail.actorType}`)
  if (detail.impersonationSessionId)
    actor += ` · ${t("audit.asUser", { user: detail.subjectName || detail.subjectUsername || detail.subjectUserId || "—" })}`
  const sessionAction = detail.action === "impersonation.start" || detail.action === "impersonation.stop"
  const summary = sessionAction
    ? t(detail.action === "impersonation.start" ? "audit.sessionStartSummary" : "audit.sessionEndSummary", {
        actor: auditIdentity(detail) || t(`audit.identity.${detail.actorType}`),
        subject: detail.subjectName || detail.subjectUsername || t("audit.notRecorded"),
        result: t(getAuditResultPresentation(detail.result).key),
      })
    : t(`audit.summary.${detail.result}`, { actor, resource, action: actionLabel })
  const metadata = detail.metadata ?? {}
  const initiator = metadata.initiated_by
  const initiatorName =
    typeof initiator === "object" && initiator !== null
      ? ["name", "username", "id"]
          .flatMap((key) =>
            key in initiator && typeof Reflect.get(initiator, key) === "string"
              ? [String(Reflect.get(initiator, key))]
              : [],
          )
          .find(Boolean)
      : undefined
  const changeValue = (value: unknown, field: string) =>
    typeof value === "boolean"
      ? t(field === "enabled" ? `audit.values.${value ? "enabled" : "disabled"}` : `audit.${value ? "yes" : "no"}`)
      : auditValue(value)
  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      toast.success(t("audit.copied"))
    } catch {
      toast.error(t("audit.copyFailed"))
    }
  }
  const information = [
    { key: "actor", value: auditIdentity(detail) || t(`audit.identity.${detail.actorType}`) },
    ...(detail.actorType === "system" && detail.actorName ? [{ key: "identity.system", value: detail.actorName }] : []),
    ...(metadata.attempted_username
      ? [{ key: "attemptedUsername", value: auditValue(metadata.attempted_username) }]
      : []),
    ...(initiatorName ? [{ key: "initiatedBy", value: initiatorName }] : []),
    ...(metadata.attempt !== undefined && metadata.attempt !== null
      ? [{ key: "attempt", value: auditValue(metadata.attempt) }]
      : []),
    ...(detail.impersonationSessionId
      ? [
          {
            key: "detail.identity",
            value: t("audit.asUser", {
              user: detail.subjectName || detail.subjectUsername || detail.subjectUserId || "—",
            }),
          },
          { key: "detail.reason", value: auditValue(metadata.reason) },
          ...(metadata.end_reason ? [{ key: "detail.endReason", value: auditValue(metadata.end_reason) }] : []),
        ]
      : []),
    { key: "resource", value: `${action?.resourceLabel || detail.resourceType || "—"} · ${resource}` },
    { key: "riskLabel", value: t(`audit.risk.${detail.riskLevel}`) },
  ]
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-lg font-semibold">{actionLabel}</h3>
        <AuditResultBadge result={detail.result} />
      </div>
      <p className="text-muted-foreground">
        {formatAuditTime(detail.occurredAt, catalog?.timezone)} · {catalog?.timezone} ·{" "}
        {detail.durationMs === null || detail.durationMs === undefined
          ? t("audit.notRecorded")
          : `${Math.round(detail.durationMs)} ms`}
      </p>
      <p>{summary}</p>
      <dl className="grid gap-2 rounded-lg border p-3">
        {information.map((item) => (
          <div key={item.key} className="grid gap-1 sm:grid-cols-[160px_1fr]">
            <dt className="text-muted-foreground">{t(`audit.${item.key}`)}</dt>
            <dd className="break-all">{item.value}</dd>
          </div>
        ))}
      </dl>
      <section className="grid gap-2">
        <h3 className="font-medium">{t("audit.changes")}</h3>
        {detail.changes?.length && (detail.result === "success" || detail.result === "partial") ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {["field", "before", "after"].map((key) => (
                    <TableHead key={key}>{t(`audit.${key}`)}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.changes.map((change) => (
                  <TableRow key={change.field}>
                    <TableCell>{action?.fields?.[change.field] || change.field}</TableCell>
                    <TableCell className="break-all">
                      {change.redacted ? "•••" : changeValue(auditChangeValue(change, "before"), change.field)}
                    </TableCell>
                    <TableCell className="break-all">
                      {change.redacted
                        ? t("audit.secretChanged")
                        : changeValue(auditChangeValue(change, "after"), change.field)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-muted-foreground">{t(auditNoChangesKey(detail.result, detail.action))}</p>
        )}
        {!!detail.changes?.length && <p className="text-xs text-muted-foreground">{t("audit.snapshotHint")}</p>}
      </section>
      {!!detail.targetCount && <AuditTargets id={detail.id} onRelated={setRelated} />}
      {detail.result !== "success" && (
        <Alert variant={detail.result === "failure" ? "destructive" : "default"}>
          <AlertTitle>{t("audit.failureReason")}</AlertTitle>
          <AlertDescription>
            <p>
              {detail.errorMessage ||
                t(
                  detail.result === "unknown"
                    ? "audit.unknownReason"
                    : detail.result === "partial"
                      ? "audit.partialReason"
                      : "audit.failureNotRecorded",
                )}
            </p>
            <p>
              {t("audit.businessCode")}: {detail.businessCode ?? "—"} · HTTP:{" "}
              {detail.httpStatus ?? detail.responseCode ?? "—"}
            </p>
          </AlertDescription>
        </Alert>
      )}
      <details>
        <summary className="cursor-pointer font-medium">{t("audit.technicalInfo")}</summary>
        <dl className="my-3 grid gap-3">
          {[
            { label: t("audit.logId"), value: detail.id, copy: true },
            { label: t("audit.actionCode"), value: detail.action, copy: true },
            { label: t("audit.actor"), value: detail.actorId, copy: true },
            { label: t("audit.resourceId"), value: detail.resourceId, copy: true },
            { label: t("audit.detail.subjectId"), value: detail.subjectUserId, copy: true },
            { label: t("audit.sourceLabel"), value: t(`audit.source.${detail.source}`) },
            { label: t("audit.path"), value: `${detail.httpMethod ?? ""} ${detail.path || t("audit.notRecorded")}` },
            { label: t("audit.ip"), value: detail.ip || "—" },
            { label: t("audit.userAgent"), value: detail.userAgent || "—" },
            { label: t("audit.requestId"), value: detail.requestId || "—", copy: !!detail.requestId },
            { label: t("audit.correlationId"), value: detail.correlationId || "—", copy: !!detail.correlationId },
            { label: t("audit.detail.sessionId"), value: detail.impersonationSessionId },
          ]
            .filter((item) => item.value)
            .map((item) => (
              <div key={item.label} className="grid gap-1">
                <dt className="text-muted-foreground">{item.label}</dt>
                <dd className="flex flex-wrap items-center gap-2 break-all">
                  {item.value}
                  {item.copy && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (item.value) void copy(item.value)
                      }}
                    >
                      {t("audit.copy")}
                    </Button>
                  )}
                </dd>
              </div>
            ))}
        </dl>
        <h4>
          {t("audit.requestSummary")} · {t("audit.redacted")}
        </h4>
        {detail.requestSummary?._truncated === true && (
          <Alert>
            <AlertDescription>{t("audit.truncated")}</AlertDescription>
          </Alert>
        )}
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-muted p-3 text-xs">
          {detail.requestSummary ? JSON.stringify(detail.requestSummary, null, 2) : t("audit.notRecorded")}
        </pre>
      </details>
      <section className="grid gap-3">
        <h3 className="font-medium">{t("audit.related")}</h3>
        <div className="flex flex-wrap gap-2">
          {[
            ...(detail.requestId ? [{ key: "sameRequest", filters: { requestId: detail.requestId } }] : []),
            ...(detail.correlationId
              ? [{ key: "sameCorrelation", filters: { correlationId: detail.correlationId } }]
              : []),
            ...(detail.resourceId && detail.resourceType
              ? [{ key: "sameResource", filters: { resourceType: detail.resourceType, resourceId: detail.resourceId } }]
              : []),
            ...(detail.impersonationSessionId
              ? [{ key: "sameSession", filters: { impersonationSessionId: detail.impersonationSessionId } }]
              : []),
          ].map((item) => (
            <Button key={item.key} variant="outline" size="sm" onClick={() => setRelated(item.filters)}>
              {t(`audit.${item.key}`)}
            </Button>
          ))}
        </div>
        {related && (
          <RelatedRecords
            key={JSON.stringify(related)}
            filters={related}
            catalog={catalog}
            onOpen={onOpen}
            onClose={() => setRelated(null)}
          />
        )}
      </section>
    </div>
  )
}
export function AuditLogDetailDrawer({
  auditId,
  catalog,
  onClose,
}: {
  auditId: string
  catalog: AuditCatalog | undefined
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const [history, setHistory] = useState([auditId])
  const active = history.at(-1) ?? auditId
  const query = useAuditDetail(active)
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <SheetContent className="w-full sm:max-w-[880px]">
        <SheetHeader>
          <SheetTitle>{t("audit.detail.title")}</SheetTitle>
          <SheetDescription>{t("audit.introduction")}</SheetDescription>
        </SheetHeader>
        <div className="grid flex-1 content-start gap-4 overflow-y-auto px-4 pb-6">
          {history.length > 1 && (
            <Button variant="outline" onClick={() => setHistory((current) => current.slice(0, -1))}>
              {t("audit.backToEvent")}
            </Button>
          )}
          {query.isPending ? (
            <Skeleton className="h-36 w-full" />
          ) : query.isError ? (
            <AuditRetry retry={() => void query.refetch()} />
          ) : query.data ? (
            <AuditDetailBody
              key={`${query.data.id}:${i18n.language}`}
              detail={query.data}
              catalog={catalog}
              onOpen={(id) => setHistory((current) => (current.at(-1) === id ? current : [...current, id]))}
            />
          ) : (
            <p>{t("audit.detail.empty")}</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
