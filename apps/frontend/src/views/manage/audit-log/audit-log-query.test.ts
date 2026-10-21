import { describe, expect, it } from "vitest"
import dayjs from "dayjs"
import { parseAuditLogQuery, serializeAuditLogQuery } from "./audit-log-query"

describe("audit search navigation", () => {
  it("defaults to a bounded day and preserves an explicitly unbounded search", () => {
    const now = dayjs("2026-10-21T12:00:00Z")
    expect(parseAuditLogQuery({}, now).filters.startTime).toBe("2026-10-20T12:00:00.000Z")
    const state = parseAuditLogQuery({ timeRange: "all", requestId: "request-1" }, now)
    expect(state.filters.startTime).toBeUndefined()
    expect(parseAuditLogQuery(serializeAuditLogQuery(state), now).filters.requestId).toBe("request-1")
    expect(serializeAuditLogQuery(state).timeRange).toBe("all")
  })
  it("rejects unsupported results and invalid page parameters", () => {
    const state = parseAuditLogQuery({ result: "future", page: "-1", pageSize: "100000", auditId: "bad" }, dayjs())
    expect(state.filters.page).toBe(1)
    expect(state.filters.pageSize).toBe(100)
    expect(state.filters.result).toBeUndefined()
    expect(state.selectedAuditId).toBeNull()
  })
})
