// @vitest-environment jsdom
import "@test/setup/layout"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, test, vi } from "vitest"
import { http, HttpResponse } from "msw"
import { server } from "@test/setup/server"
import { renderAdmin } from "@test/setup/render"
import { homeOverview, homeActivity, homeResource } from "@test/setup/home-fixtures"
import { homeCapabilities } from "@/views/home/modules/home-model"
import { useAuthStore } from "@/stores/auth"
import i18n from "@/locales"
import HomePage from "@/views/home"
vi.mock("@/services/app-socket", () => ({
  openAppSocket: () => ({ on: () => {}, off: () => {}, connected: false }),
  closeAppSocket: () => {},
  resetAppSockets: () => {},
}))
afterEach(() => useAuthStore.getState().clearAuth())
test("home composes the six source capabilities once, greets its actor, and refreshes the current capabilities and mounted data", async () => {
  await i18n.changeLanguage("en-US")
  useAuthStore.getState().setToken("access", "root-home-session")
  useAuthStore.setState({
    userInfo: {
      id: "actor",
      username: "actor",
      name: "Home Actor",
      email: "",
      isAdmin: true,
      roles: [],
      buttons: [],
      createTime: "",
      updateTime: "",
    },
  })
  const reads: string[] = []
  server.use(
    http.get("http://localhost:16000/api/v1/*", ({ request }) => {
      const path = new URL(request.url).pathname
      reads.push(path)
      const data = path.endsWith("/capabilities")
        ? { allowedModules: homeCapabilities, revision: "home" }
        : path.endsWith("/operations-overview")
          ? homeOverview()
          : path.endsWith("/health")
            ? { qps: 1, p50Ms: 2, p95Ms: 3, http5Xx1H: 0, bizErrors1H: 0, wsConnections: 0 }
            : path.endsWith("/business")
              ? { roles: 101, menus: 102, routers: 103, schedules: 104 }
              : path.endsWith("/infrastructure")
                ? {
                    pg: { status: "healthy", latencyMs: 1 },
                    redis: { status: "healthy", latencyMs: 1 },
                    minio: { status: "down", latencyMs: 0 },
                  }
                : path.endsWith("/resources")
                  ? { instances: [homeResource("node", 1)], summary: homeResource("summary", 1) }
                  : path.endsWith("/activities")
                    ? { items: [homeActivity("root-task")], size: 20, nextCursor: null }
                    : []
      return HttpResponse.json({ code: 0, data })
    }),
  )
  renderAdmin(<HomePage />)
  expect(await screen.findByRole("heading", { name: "Operations overview" })).toBeInTheDocument()
  for (const name of ["App Status", "Recent Activity", "Infrastructure", "API Overview"])
    expect(await screen.findByRole("heading", { name })).toBeInTheDocument()
  expect(screen.queryByRole("heading", { name: "Business Data" })).not.toBeInTheDocument()
  expect(await screen.findByText("104")).toBeInTheDocument()
  expect(screen.getByText(/Home Actor/)).toBeInTheDocument()
  expect(reads.filter((path) => path.endsWith("/business"))).toHaveLength(1)
  expect(reads.some((path) => /users\/stats|tasks\/stats|workers\/all|stats\/errors/.test(path))).toBe(false)
  const refresh = screen.getByRole("button", { name: "Refresh" })
  await waitFor(() => expect(refresh).toBeEnabled())
  expect(reads.filter((path) => path.endsWith("/capabilities"))).toHaveLength(1)
  await userEvent.setup().click(refresh)
  await waitFor(() => expect(reads.filter((path) => path.endsWith("/operations-overview"))).toHaveLength(2))
  expect(reads.filter((path) => path.endsWith("/capabilities"))).toHaveLength(2)
})
