// @vitest-environment jsdom
import "@test/setup/layout"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, test, vi } from "vitest"
import { http, HttpResponse } from "msw"
import { server } from "@test/setup/server"
import { renderAdmin } from "@test/setup/render"
import { homeOverview, homeResource } from "@test/setup/home-fixtures"
import { useAuthStore } from "@/stores/auth"
import i18n from "@/locales"
import { OperationsOverviewModule } from "@/views/home/modules/operations-overview"
import { ApplicationHealthModule, BusinessModule } from "@/views/home/modules/application-health"
import { InfrastructureModule } from "@/views/home/modules/infrastructure-overview"
import { ApiOverviewModule } from "@/views/home/modules/api-overview"
const base = "http://localhost:16000/api/v1"
const reply = (data: unknown) => HttpResponse.json({ code: 0, data })
async function setup(allowed: string[]) {
  await i18n.changeLanguage("en-US")
  useAuthStore.getState().setToken("home-access", "home-ui-session")
  server.use(http.get(`${base}/dashboard/capabilities`, () => reply({ allowedModules: allowed, revision: "home" })))
  return userEvent.setup()
}
afterEach(() => {
  useAuthStore.getState().clearAuth()
  vi.restoreAllMocks()
})
test("operations renders all summary/system values, zero and null distinctly, and retries the failing seven-day query", async () => {
  const user = await setup(["dashboard.overview"])
  let failed = true
  server.use(
    http.get(`${base}/system/stats/operations-overview`, ({ request }) => {
      expect(new URL(request.url).searchParams.get("range")).toBe("7d")
      if (failed) return HttpResponse.json({ code: 15001, data: null })
      const data = homeOverview()
      data.summary.tasks = null
      return reply(data)
    }),
  )
  renderAdmin(<OperationsOverviewModule />)
  expect(await screen.findByRole("alert")).toBeInTheDocument()
  failed = false
  await user.click(screen.getByRole("button", { name: "Retry" }))
  expect(await screen.findByText("Active users")).toBeInTheDocument()
  expect(screen.getByText("0.00%")).toBeInTheDocument()
  expect(screen.getByText("1 d 1 h 1 m")).toBeInTheDocument()
  expect(screen.getByText("95.00%")).toBeInTheDocument()
  expect(screen.getByText("Queue depth")).toBeInTheDocument()
  expect(screen.getByText("Last data sync")).toBeInTheDocument()
  expect(screen.getAllByText("—").length).toBeGreaterThan(0)
  expect(screen.getByRole("combobox", { name: "Operations overview" })).toHaveTextContent("Last 7 Days")
})
test("application health merges the four permitted business metrics while business-only still renders them", async () => {
  await setup(["dashboard.application-health", "dashboard.business"])
  server.use(
    http.get(`${base}/system/stats/health`, () =>
      reply({ qps: 2, p50Ms: 3, p95Ms: 4, http5Xx1H: 0, bizErrors1H: 1, wsConnections: 7 }),
    ),
    http.get(`${base}/system/stats/business`, () => reply({ roles: 11, menus: 12, routers: 13, schedules: 14 })),
  )
  const view = renderAdmin(<ApplicationHealthModule />)
  expect(await screen.findByText("14")).toBeInTheDocument()
  for (const text of [
    "QPS",
    "P50",
    "P95",
    "HTTP 5xx",
    "Biz Errors",
    "Roles",
    "Menus",
    "API Routes",
    "Schedules",
    "Degraded",
  ])
    expect(screen.getByText(text)).toBeInTheDocument()
  view.unmount()
  renderAdmin(<BusinessModule />)
  expect(await screen.findByText("Business Data")).toBeInTheDocument()
  expect(await screen.findByText("14")).toBeInTheDocument()
})
test("health without business permission never requests or displays business counts", async () => {
  await setup(["dashboard.application-health"])
  const business = vi.fn()
  server.use(
    http.get(`${base}/system/stats/health`, () =>
      reply({ qps: 0, p50Ms: 0, p95Ms: 0, http5Xx1H: 0, bizErrors1H: 0, wsConnections: 0 }),
    ),
    http.get(`${base}/system/stats/business`, () => {
      business()
      return reply({ roles: 1, menus: 1, routers: 1, schedules: 1 })
    }),
  )
  renderAdmin(<ApplicationHealthModule />)
  expect(await screen.findByText("QPS")).toBeInTheDocument()
  expect(screen.queryByText("Business Scale")).not.toBeInTheDocument()
  expect(business).not.toHaveBeenCalled()
})
test("infrastructure selects an instance and displays service latency, resource percentages and network rates", async () => {
  const user = await setup(["dashboard.infrastructure"])
  server.use(
    http.get(`${base}/system/stats/infrastructure`, () =>
      reply({
        pg: { status: "healthy", latencyMs: 1 },
        redis: { status: "degraded", latencyMs: 2 },
        minio: { status: "down", latencyMs: 3 },
      }),
    ),
    http.get(`${base}/system/stats/resources`, () =>
      reply({
        instances: [homeResource("node-a", 10), homeResource("node-b", 90)],
        summary: homeResource("summary", 50),
      }),
    ),
  )
  renderAdmin(<InfrastructureModule />)
  const select = await screen.findByRole("combobox", { name: "Instance" })
  await user.click(select)
  await user.click(await screen.findByRole("option", { name: "node-b" }))
  expect(screen.getByText("90%")).toBeInTheDocument()
  expect(screen.getByText("PostgreSQL")).toBeInTheDocument()
  expect(screen.getByText("3ms")).toBeInTheDocument()
  expect(screen.getByText("1.0 KB/s")).toBeInTheDocument()
  expect(screen.getByText("1.0 MB/s")).toBeInTheDocument()
})
test("API overview renders independent empty charts and errors with a retryable top-five request", async () => {
  const user = await setup(["dashboard.api-monitoring"])
  let failed = true
  server.use(
    http.get(`${base}/system/stats/api/distribution`, () => reply([])),
    http.get(`${base}/system/stats/api/trend`, () => reply([])),
    http.get(`${base}/system/stats/api/top`, ({ request }) => {
      const params = new URL(request.url).searchParams
      expect(params.get("range")).toBe("24h")
      expect(params.get("sortBy")).toBe("errors")
      expect(params.get("limit")).toBe("5")
      return failed
        ? HttpResponse.json({ code: 15001, data: null })
        : reply([{ path: "/failed", method: "GET", errorCount: 3, errorRate: 50, requestCount: 6, avgMs: 1, p95Ms: 1 }])
    }),
  )
  renderAdmin(<ApiOverviewModule />)
  expect(await screen.findByRole("alert")).toBeInTheDocument()
  failed = false
  await user.click(screen.getByRole("button", { name: "Retry" }))
  expect(await screen.findByText("/failed")).toBeInTheDocument()
  expect(screen.getByText("50%")).toBeInTheDocument()
  expect(screen.getAllByText("No Data")).toHaveLength(2)
})

test.each([
  ["healthy", "Synced"],
  ["delayed", "Sync delayed"],
  ["failed", "Sync failed"],
  ["unavailable", "Sync unavailable"],
] as const)(
  "operations distinguishes the backend sync state %s without presenting it as another state",
  async (state, expected) => {
    await setup(["dashboard.overview"])
    server.use(
      http.get(`${base}/system/stats/operations-overview`, () => {
        const data = homeOverview()
        data.system.syncStatus = state
        if (state === "failed" || state === "unavailable") data.system.lastSyncAt = null
        return reply(data)
      }),
    )
    renderAdmin(<OperationsOverviewModule />)
    expect(await screen.findByText(expected)).toBeInTheDocument()
  },
)
