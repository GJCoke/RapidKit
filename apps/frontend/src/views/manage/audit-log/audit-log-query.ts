import dayjs from "dayjs"

export interface AuditLogPageState {
  filters: Api.SystemManage.AuditLogQuery
  selectedAuditId: string | null
  timeRange: "24h" | "all" | "custom"
}

const fields = [
  "action",
  "actorId",
  "actorKeyword",
  "subjectUserId",
  "impersonationSessionId",
  "resourceType",
  "resourceId",
  "resourceKeyword",
  "requestId",
  "correlationId",
  "ip",
] as const
const uuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i

export function parseAuditLogQuery(query: Record<string, unknown>, now = dayjs()): AuditLogPageState {
  const value = (key: string) => (typeof query[key] === "string" ? (query[key] as string) : undefined)
  const integer = (key: string, fallback: number, max: number) => {
    const number = Number(value(key))
    return Number.isInteger(number) && number > 0 ? Math.min(number, max) : fallback
  }
  const filters: Api.SystemManage.AuditLogQuery = {
    page: integer("page", 1, Number.MAX_SAFE_INTEGER),
    pageSize: integer("pageSize", 20, 100),
  }
  for (const key of fields) {
    const text = value(key)?.trim()
    if (
      text &&
      text.length <= 200 &&
      (!key.endsWith("Id") || !["actorId", "subjectUserId", "impersonationSessionId"].includes(key) || uuid.test(text))
    )
      filters[key] = text
  }
  const result = value("result")
  if (["success", "failure", "partial", "unknown"].includes(result || ""))
    filters.result = result as Api.SystemManage.AuditResult
  const risk = value("riskLevel")
  if (["normal", "sensitive", "critical"].includes(risk || ""))
    filters.riskLevel = risk as Api.SystemManage.AuditRiskLevel
  const source = value("source")
  if (["http", "domain_event", "system"].includes(source || "")) filters.source = source as Api.SystemManage.AuditSource
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
    timeRange = "custom"
  } else if (timeRange !== "all") {
    filters.startTime = now.subtract(24, "hour").toISOString()
    filters.endTime = now.toISOString()
  }
  return { filters, timeRange, selectedAuditId: uuid.test(value("auditId") || "") ? value("auditId")! : null }
}

export function serializeAuditLogQuery(state: AuditLogPageState): Record<string, string> {
  const query: Record<string, string> = { timeRange: state.timeRange }
  for (const [key, value] of Object.entries(state.filters))
    if (value !== null && value !== undefined && value !== "") query[key] = String(value)
  if (state.selectedAuditId) query.auditId = state.selectedAuditId
  return query
}
