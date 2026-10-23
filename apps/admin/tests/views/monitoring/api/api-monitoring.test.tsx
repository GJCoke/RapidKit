// @vitest-environment jsdom
import "@test/setup/layout"
import { act, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, test, vi } from "vitest"
import { http, HttpResponse } from "msw"
import { server } from "@test/setup/server"
import { renderAdmin } from "@test/setup/render"
import { useAuthStore } from "@/stores/auth"
import i18n from "@/locales"
import ApiPage from "@/views/monitoring/api"
vi.mock("@/services/app-socket", () => ({
  openAppSocket: () => ({ on: vi.fn(), off: vi.fn(), connected: true }),
  closeAppSocket: vi.fn(),
}))
const base = "http://localhost:16000/api/v1/system/stats/api",
  reply = (data: unknown) => HttpResponse.json({ code: 0, data }),
  metric = {
    path: "/api/v1/users",
    method: "GET",
    requestCount: 1234,
    errorCount: 5,
    errorRate: 5,
    avgMs: 25,
    p95Ms: 3001,
  }
async function setup() {
  await i18n.changeLanguage("en-US")
  useAuthStore.getState().setToken("access", "api-monitoring-ui-session")
  useAuthStore.setState({
    userInfo: {
      id: "admin",
      username: "admin",
      name: "Admin",
      email: "",
      isAdmin: true,
      roles: [],
      buttons: [],
      createTime: "",
      updateTime: "",
    },
  })
  const requests: string[] = []
  server.use(
    http.get(`${base}/:kind`, ({ request, params }) => {
      requests.push(request.url)
      if (params.kind === "overview")
        return reply({ totalRequests: 1234, totalErrors: 5, avgErrorRate: 0.4, avgMs: 25, busiestCount: 123 })
      if (params.kind === "list")
        return reply({
          records: [metric],
          total: 61,
          page: Number(new URL(request.url).searchParams.get("page")),
          pageSize: 20,
        })
      if (params.kind === "trend")
        return reply([
          { timeBucket: "2026-10-24T10:00:00+08:00", requestCount: 10, errorCount: 1 },
          { timeBucket: "2026-10-24T11:00:00+08:00", requestCount: 20, errorCount: 2 },
        ])
      if (params.kind === "distribution") return reply([{ ...metric, percentage: 100 }])
      return reply([metric])
    }),
  )
  const view = renderAdmin(<ApiPage />)
  await screen.findByRole("cell", { name: metric.path })
  return { ...view, requests, user: userEvent.setup() }
}
afterEach(() => useAuthStore.getState().clearAuth())
test("overview and four chart sections preserve metrics and filters affect only the detail query", async () => {
  const { user, requests } = await setup()
  for (const title of ["Request Distribution", "Request Trend", "Top Requests", "Top P95 Response Time"])
    expect(screen.getByRole("figure", { name: title })).toBeInTheDocument()
  const before = requests.length
  await user.type(screen.getByRole("textbox", { name: "Path" }), "users")
  expect(requests).toHaveLength(before)
  await user.click(screen.getByRole("button", { name: "Search" }))
  await waitFor(() => expect(new URL(requests.at(-1)!).searchParams.get("keyword")).toBe("users"))
  expect(requests.slice(before)).toHaveLength(1)
  await user.click(screen.getByRole("button", { name: "Reset" }))
  await waitFor(() => expect(new URL(requests.at(-1)!).searchParams.has("keyword")).toBe(false))
  const count = requests.length
  await user.click(screen.getByRole("button", { name: "6h" }))
  await waitFor(() => expect(requests.length).toBe(count + 6))
  expect(requests.slice(count).every((url) => new URL(url).searchParams.get("range") === "6h")).toBe(true)
})
test("numeric column headers map three-state remote sorting without resetting the current page", async () => {
  const { user, requests } = await setup()
  await user.click(screen.getByRole("button", { name: "Next" }))
  await waitFor(() => expect(new URL(requests.at(-1)!).searchParams.get("page")).toBe("2"))
  const table = screen.getByRole("table"),
    button = within(table).getByRole("button", { name: /^P95 RT/ })
  for (const order of ["desc", "asc"]) {
    await user.click(button)
    expect(button).toHaveFocus()
    await waitFor(() => expect(new URL(requests.at(-1)!).searchParams.get("sortOrder")).toBe(order))
    expect(new URL(requests.at(-1)!).searchParams.get("sortBy")).toBe("p95_ms")
    expect(new URL(requests.at(-1)!).searchParams.get("page")).toBe("2")
  }
  await user.click(button)
  await waitFor(() => expect(new URL(requests.at(-1)!).searchParams.get("sortBy")).toBe("request_count"))
  expect(new URL(requests.at(-1)!).searchParams.get("sortOrder")).toBe("desc")
})
test("summary errors do not appear as zero metrics, each section retries independently and permission loss hides all data", async () => {
  const { user } = await setup()
  server.use(http.get(`${base}/overview`, () => HttpResponse.json({ code: 500, msg: "failed" })))
  await user.click(screen.getByRole("button", { name: "Refresh" }))
  const summary = screen.getByRole("region", { name: "API summary" })
  await within(summary).findByRole("alert")
  expect(within(summary).queryByText("1,234")).toBeNull()
  expect(screen.getByRole("cell", { name: metric.path })).toBeInTheDocument()
  server.use(
    http.get(`${base}/overview`, () =>
      reply({ totalRequests: 99, totalErrors: 1, avgErrorRate: 1, avgMs: 5, busiestCount: 10 }),
    ),
  )
  await user.click(within(summary).getByRole("button", { name: "Retry" }))
  await within(summary).findByText("99", { exact: true })
  act(() =>
    useAuthStore.setState((state) => ({
      userInfo: state.userInfo ? { ...state.userInfo, isAdmin: false, buttons: [] } : null,
    })),
  )
  await screen.findByText("You do not have permission to access this page")
  expect(screen.queryByRole("table")).toBeNull()
  expect(screen.queryByRole("figure")).toBeNull()
})

test("selecting the default requests-descending header still refreshes its unchanged server parameters", async () => {
  const { user, requests } = await setup()
  const before = requests.length
  await user.click(within(screen.getByRole("table")).getByRole("button", { name: /^Requests/ }))
  await waitFor(() => expect(requests).toHaveLength(before + 1))
  expect(new URL(requests.at(-1)!).searchParams.get("sortBy")).toBe("request_count")
  expect(new URL(requests.at(-1)!).searchParams.get("sortOrder")).toBe("desc")
})
