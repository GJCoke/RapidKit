export function getAuditResultPresentation(result: string): {
  key: string
  type: "success" | "error" | "warning" | "default"
} {
  const types = { success: "success", failure: "error", partial: "warning", unknown: "default" } as const
  const value = Object.hasOwn(types, result) ? result as keyof typeof types : "unknown"
  return { key: `page.manage.auditLog.result.${value}`, type: types[value] }
}
