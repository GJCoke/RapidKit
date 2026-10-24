// @vitest-environment jsdom
import { expect, test } from "vitest"
import { http, HttpResponse } from "msw"
import { server } from "@test/setup/server"
import {
  fetchOperationsOverview,
  fetchHealthStats,
  fetchInfrastructureHealth,
  fetchBusinessSummary,
  fetchSystemResources,
  fetchActivities,
  fetchAdminContacts,
} from "@/services/api/dashboard"

test("home services preserve the generated contract including repeated activity categories and resource selection", async () => {
  const seen: { path: string; method: string; params: [string, string][] }[] = []
  server.use(
    http.get("http://localhost:16000/api/v1/*", ({ request }) => {
      const url = new URL(request.url)
      seen.push({ path: url.pathname, method: request.method, params: [...url.searchParams] })
      return HttpResponse.json({ code: 0, data: { sentinel: true } })
    }),
  )
  const responses = await Promise.all([
    fetchOperationsOverview({ range: "7d" }),
    fetchHealthStats(),
    fetchInfrastructureHealth(),
    fetchBusinessSummary(),
    fetchSystemResources("instance-a"),
    fetchActivities({ categories: ["user", "task"], size: 20 }),
    fetchAdminContacts(),
  ])
  expect(responses.every((response) => response.error === null)).toBe(true)
  expect(seen).toEqual([
    { path: "/api/v1/system/stats/operations-overview", method: "GET", params: [["range", "7d"]] },
    { path: "/api/v1/system/stats/health", method: "GET", params: [] },
    { path: "/api/v1/system/stats/infrastructure", method: "GET", params: [] },
    { path: "/api/v1/system/stats/business", method: "GET", params: [] },
    { path: "/api/v1/system/stats/resources", method: "GET", params: [["instance", "instance-a"]] },
    {
      path: "/api/v1/system/activities",
      method: "GET",
      params: [
        ["categories", "user"],
        ["categories", "task"],
        ["size", "20"],
      ],
    },
    { path: "/api/v1/users/admin-contacts", method: "GET", params: [] },
  ])
})
