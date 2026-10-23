// @vitest-environment jsdom
import { expect, test } from "vitest"
import { http, HttpResponse } from "msw"
import { server } from "@test/setup/server"
import {
  fetchAuditLogs,
  fetchAuditDetail,
  fetchAuditCatalog,
  fetchAuditActors,
  fetchAuditTargets,
} from "@/services/api/audit-log"
const base = "http://localhost:16000/api/v1/system/audit-logs"
test("audit reads preserve list, identity, correlation and pagination query contracts", async () => {
  const calls: unknown[] = []
  server.use(
    http.get(`${base}/*`, ({ request }) => {
      const u = new URL(request.url)
      calls.push([u.pathname, Object.fromEntries(u.searchParams)])
      return HttpResponse.json({ code: 0, data: [] })
    }),
  )
  await fetchAuditLogs({
    page: 2,
    pageSize: 20,
    keyword: "Test",
    result: "partial",
    requestId: "req",
    view: "attention",
    correlationId: "correlation",
  })
  await fetchAuditDetail("event")
  await fetchAuditCatalog()
  await fetchAuditActors({ keyword: "Lin", limit: 20 })
  await fetchAuditTargets("event", { page: 3, pageSize: 20 })
  expect(calls).toEqual([
    [
      "/api/v1/system/audit-logs/paginate",
      {
        page: "2",
        pageSize: "20",
        keyword: "Test",
        result: "partial",
        requestId: "req",
        view: "attention",
        correlationId: "correlation",
      },
    ],
    ["/api/v1/system/audit-logs/event", {}],
    ["/api/v1/system/audit-logs/catalog", {}],
    ["/api/v1/system/audit-logs/actors", { keyword: "Lin", limit: "20" }],
    ["/api/v1/system/audit-logs/event/targets", { page: "3", pageSize: "20" }],
  ])
})
