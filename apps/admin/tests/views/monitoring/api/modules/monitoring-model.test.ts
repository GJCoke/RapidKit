import { expect, test } from "vitest"
import {
  applyApiStats,
  parseApiStats,
  nextApiSort,
  monitoringListQuery,
  monitoringRanges,
  monitoringMethods,
} from "@/views/monitoring/api/modules/monitoring-model"
test("only complete finite nonnegative stats packets are applied and retain non-live overview fields", () => {
  const base = {
    totalRequests: 100,
    totalErrors: 2,
    avgErrorRate: 2,
    avgMs: 15,
    busiestMethod: "GET",
    busiestPath: "/test",
    busiestCount: 10,
  }
  const event = parseApiStats({ deltaRequests: 5, deltaErrors: 1, errorRate: 10, topFailures: [] })
  expect(event).not.toBeNull()
  expect(applyApiStats(base, event!)).toEqual({ ...base, totalRequests: 105, totalErrors: 3, avgErrorRate: 10 })
  for (const invalid of [
    null,
    [],
    {},
    { deltaRequests: -1, deltaErrors: 0, errorRate: 0 },
    { deltaRequests: 1.5, deltaErrors: 0, errorRate: 0 },
    { deltaRequests: Infinity, deltaErrors: 0, errorRate: 0 },
    { deltaRequests: 1, deltaErrors: 1, errorRate: 101 },
  ])
    expect(parseApiStats(invalid)).toBeNull()
})
test("remote sorting maps all source fields and clearing restores the canonical default", () => {
  for (const field of ["requestCount", "errorCount", "errorRate", "avgMs", "p95Ms"] as const) {
    const first = nextApiSort(null, field),
      second = nextApiSort(first, field),
      clear = nextApiSort(second, field)
    expect(first).toEqual({ field, order: "desc" })
    expect(second).toEqual({ field, order: "asc" })
    expect(clear).toBeNull()
    expect(monitoringListQuery({ range: "6h", page: 2, pageSize: 50, keyword: "/users", sort: first })).toMatchObject({
      range: "6h",
      page: 2,
      pageSize: 50,
      keyword: "/users",
      sortOrder: "desc",
    })
  }
  expect(monitoringListQuery({ range: "24h", page: 1, pageSize: 20, keyword: "", sort: null })).toEqual({
    range: "24h",
    page: 1,
    pageSize: 20,
    sortBy: "request_count",
    sortOrder: "desc",
  })
  expect(monitoringRanges).toEqual(["1h", "6h", "24h", "7d"])
  expect(monitoringMethods).toEqual(["GET", "POST", "PUT", "DELETE", "PATCH"])
})
