import { dayjs } from "./audit-log-time"
import type { TFunction } from "i18next"
import type { AuditCatalog, AuditDetail } from "@/services/api/audit-log"

export function formatAuditTime(value?: string | null, zone?: string) {
  return value
    ? dayjs(value)
        .tz(zone || Intl.DateTimeFormat().resolvedOptions().timeZone)
        .format("YYYY-MM-DD HH:mm:ss")
    : "—"
}

export function auditChangeValue(change: NonNullable<AuditDetail["changes"]>[number], side: "before" | "after") {
  if (change.redacted) return null
  return change[side === "before" ? "beforeDisplay" : "afterDisplay"] ?? change[side]
}

export function auditNoChangesKey(result: string, action: string) {
  if (result === "failure") return "audit.noChangesFailure" as const
  if (result === "unknown") return "audit.noChangesUnknown" as const
  if (action.startsWith("impersonation.")) return "audit.noChangesSession" as const
  return "audit.noChanges" as const
}

export function getAuditResultPresentation(result: string): {
  key: string
  type: "default" | "destructive" | "secondary" | "outline"
} {
  const types = { success: "default", failure: "destructive", partial: "secondary", unknown: "outline" } as const
  const value = Object.hasOwn(types, result) ? (result as keyof typeof types) : "unknown"
  return { key: `audit.result.${value}`, type: types[value] }
}

export function auditIdentity(person: {
  actorType?: string | null
  actorName?: string | null
  actorUsername?: string | null
  actorId?: string | null
}) {
  if (person.actorType === "system") return ""
  if (person.actorName && person.actorUsername) return `${person.actorName} (${person.actorUsername})`
  return person.actorUsername || person.actorName || person.actorId || ""
}

export function auditValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—"
  if (typeof value === "object") return JSON.stringify(value)
  return String(value)
}

export function auditResourceLabel(
  row: Pick<
    AuditDetail,
    "resourceType" | "resourceName" | "resourceId" | "subjectName" | "subjectUsername" | "targetCount"
  >,
  t: TFunction,
) {
  if (row.resourceType === "impersonation")
    return t("audit.sessionFor", { user: row.subjectName || row.subjectUsername || t("audit.notRecorded") })
  return (
    row.resourceName ||
    (row.targetCount ? t("audit.targetCount", { count: row.targetCount }) : row.resourceId || t("audit.notRecorded"))
  )
}

export function auditActionLabel(action: string, catalog: AuditCatalog | undefined, t: TFunction) {
  return (
    catalog?.actions.find((item) => item.code === action)?.label ||
    (action === "http.request" ? t("audit.unclassified") : action)
  )
}
