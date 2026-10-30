import { formatApiTime } from "@/utils/datetime"

export function formatAuditTime(value?: string | null, zone?: string) {
  return formatApiTime(value, zone || undefined)
}

export function auditChangeValue(
  change: NonNullable<NonNullable<Api.SystemManage.AuditLogDetail>["changes"]>[number],
  side: "before" | "after",
) {
  if (change.redacted) return null
  return change[side === "before" ? "beforeDisplay" : "afterDisplay"] ?? change[side]
}

export function auditNoChangesKey(result: string, action: string) {
  if (result === "failure") return "page.manage.auditLog.noChangesFailure" as const
  if (result === "unknown") return "page.manage.auditLog.noChangesUnknown" as const
  if (action.startsWith("impersonation.")) return "page.manage.auditLog.noChangesSession" as const
  return "page.manage.auditLog.noChanges" as const
}

export function getAuditResultPresentation(result: string): {
  key: string
  type: "success" | "error" | "warning" | "default"
} {
  const types = { success: "success", failure: "error", partial: "warning", unknown: "default" } as const
  const value = Object.hasOwn(types, result) ? (result as keyof typeof types) : "unknown"
  return { key: `page.manage.auditLog.result.${value}`, type: types[value] }
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
