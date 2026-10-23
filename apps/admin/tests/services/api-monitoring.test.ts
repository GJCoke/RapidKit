// @vitest-environment jsdom
import { expect, test } from "vitest"
import { http, HttpResponse } from "msw"
import { server } from "@test/setup/server"
import {
  fetchApiOverview,
  fetchApiDistribution,
  fetchApiTrend,
  fetchApiTop,
  fetchApiList,
} from "@/services/api/api-monitoring"
test("all five monitoring endpoints retain exact range, pagination and remote sorting parameters", async () => {
  const calls: unknown[] = []
  server.use(
    http.get("http://localhost:16000/api/v1/system/stats/api/*", ({ request }) => {
      const url = new URL(request.url)
      calls.push([url.pathname, Object.fromEntries(url.searchParams)])
      return HttpResponse.json({ code: 0, data: {} })
    }),
  )
  await fetchApiOverview({ range: "1h" })
  await fetchApiDistribution({ range: "6h" })
  await fetchApiTrend({ range: "7d" })
  await fetchApiTop({ range: "24h", sortBy: "p95_ms", limit: 10 })
  await fetchApiList({
    range: "24h",
    keyword: "/users",
    page: 2,
    pageSize: 500,
    sortBy: "error_rate",
    sortOrder: "asc",
  })
  expect(calls).toEqual([
    ["/api/v1/system/stats/api/overview", { range: "1h" }],
    ["/api/v1/system/stats/api/distribution", { range: "6h" }],
    ["/api/v1/system/stats/api/trend", { range: "7d" }],
    ["/api/v1/system/stats/api/top", { range: "24h", sortBy: "p95_ms", limit: "10" }],
    [
      "/api/v1/system/stats/api/list",
      { range: "24h", keyword: "/users", page: "2", pageSize: "500", sortBy: "error_rate", sortOrder: "asc" },
    ],
  ])
})
