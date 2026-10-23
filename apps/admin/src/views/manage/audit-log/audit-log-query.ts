import dayjs from "dayjs"
import type { AuditLogQuery } from "@/services/api/audit-log"

export interface AuditLogPageState {
  filters: AuditLogQuery
  selectedAuditId: string | null
  timeRange: "24h" | "all" | "custom"
}

const fields = [
  "action",
  "actorId",
  "actorKeyword",
  "keyword",
  "subjectUserId",
  "impersonationSessionId",
  "resourceType",
  "resourceId",
  "resourceKeyword",
  "requestId",
  "correlationId",
  "ip",
] as const
export const auditUuidPattern = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i

export function parseAuditLogQuery(query: Record<string, unknown>, now = dayjs()): AuditLogPageState {
  const value = (key: string) => {
    const raw = query[key]
    return typeof raw === "string" ? raw : undefined
  }
  const integer = (key: string, fallback: number, max: number) => {
    const number = Number(value(key))
    return Number.isInteger(number) && number > 0 ? Math.min(number, max) : fallback
  }
  const filters: AuditLogQuery = {
    page: integer("page", 1, Number.MAX_SAFE_INTEGER),
    pageSize: integer("pageSize", 20, 100),
  }
  for (const key of fields) {
    const text = value(key)?.trim()
    if (
      text &&
      text.length <= 200 &&
      (!key.endsWith("Id") ||
        !["actorId", "subjectUserId", "impersonationSessionId"].includes(key) ||
        auditUuidPattern.test(text))
    )
      filters[key] = text
  }
  const result = value("result")
  if (result === "success" || result === "failure" || result === "partial" || result === "unknown")
    filters.result = result
  const risk = value("riskLevel")
  if (risk === "normal" || risk === "sensitive" || risk === "critical") filters.riskLevel = risk
  const source = value("source")
  if (source === "http" || source === "domain_event" || source === "system") filters.source = source
  const view = value("view")
  if (view === "all" || view === "attention" || view === "impersonation" || view === "system") filters.view = view
  let timeRange: AuditLogPageState["timeRange"] = value("timeRange") === "all" ? "all" : "24h"
  const start = value("startTime"),
    end = value("endTime")
  if (
    timeRange !== "all" &&
    start &&
    end &&
    dayjs(start).isValid() &&
    dayjs(end).isValid() &&
    dayjs(end).isAfter(dayjs(start))
  ) {
    filters.startTime = dayjs(start).toISOString()
    filters.endTime = dayjs(end).toISOString()
    timeRange = value("timeRange") === "24h" ? "24h" : "custom"
  } else if (timeRange !== "all") {
    filters.startTime = now.subtract(24, "hour").toISOString()
    filters.endTime = now.toISOString()
  }
  const selected = value("auditId")
  return { filters, timeRange, selectedAuditId: selected && auditUuidPattern.test(selected) ? selected : null }
}

export function serializeAuditLogQuery(state: AuditLogPageState): Record<string, string> {
  const query: Record<string, string> = { timeRange: state.timeRange }
  for (const [key, value] of Object.entries(state.filters))
    if (value !== null && value !== undefined && value !== "") query[key] = String(value)
  if (state.selectedAuditId) query.auditId = state.selectedAuditId
  return query
}
