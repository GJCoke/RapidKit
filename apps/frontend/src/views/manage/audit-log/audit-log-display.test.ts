import { describe, expect, it } from "vitest"
import { getAuditResultPresentation } from "./audit-log-display"

describe("audit result presentation", () => {
  it.each([
    ["success", "success", "success"],
    ["failure", "failure", "error"],
    ["partial", "partial", "warning"],
    ["unknown", "unknown", "default"],
    ["future-result", "unknown", "default"],
  ])("presents %s without treating uncertainty as success", (result, key, type) => {
    expect(getAuditResultPresentation(result)).toEqual({ key: `page.manage.auditLog.result.${key}`, type })
  })
})
