import { describe, expect, it } from "vitest"
import {
  auditChangeValue,
  auditNoChangesKey,
  formatAuditTime,
  getAuditResultPresentation,
} from "@/views/manage/audit-log/audit-log-display"

describe("audit result presentation", () => {
  it.each([
    ["success", "success", "default"],
    ["failure", "failure", "destructive"],
    ["partial", "partial", "secondary"],
    ["unknown", "unknown", "outline"],
    ["future-result", "unknown", "outline"],
  ])("presents %s without treating uncertainty as success", (result, key, type) => {
    expect(getAuditResultPresentation(result)).toEqual({ key: `audit.result.${key}`, type })
  })
})

it("uses the event-time reference label and falls back to the retained ID for historical records", () => {
  expect(
    auditChangeValue({ field: "parent_id", after: "id-1", afterDisplay: "Engineering", redacted: false }, "after"),
  ).toBe("Engineering")
  expect(auditChangeValue({ field: "parent_id", after: "id-1", redacted: false }, "after")).toBe("id-1")
  expect(
    auditChangeValue({ field: "password", after: "secret", afterDisplay: "secret", redacted: true }, "after"),
  ).toBeNull()
})

it("explains missing changes according to the outcome and event type", () => {
  expect(auditNoChangesKey("failure", "user.update")).toBe("audit.noChangesFailure")
  expect(auditNoChangesKey("unknown", "user.update")).toBe("audit.noChangesUnknown")
  expect(auditNoChangesKey("success", "impersonation.start")).toBe("audit.noChangesSession")
})

it("renders an instant in the catalog timezone instead of the browser timezone", () => {
  expect(formatAuditTime("2026-10-21T10:00:00Z", "Asia/Shanghai")).toBe("2026-10-21 18:00:00")
})
