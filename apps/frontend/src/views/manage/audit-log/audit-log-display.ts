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
