// @vitest-environment jsdom
import "@test/setup/layout"
import { act, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, test } from "vitest"
import { http, HttpResponse } from "msw"
import { server } from "@test/setup/server"
import { renderAdmin } from "@test/setup/render"
import { useAuthStore } from "@/stores/auth"
import i18n from "@/locales"
import PluginPage from "@/views/monitoring/plugin"
const base = "http://localhost:16000/api/v1/system"
const plugins = [
  {
    name: "System",
    version: "1.2.3",
    status: "loaded",
    required: true,
    dependencies: ["Core"],
    loadTimeMs: 1.23,
    startupTimeMs: 0,
  },
  { name: "Disabled", status: "disabled" },
  {
    name: "Broken",
    status: "failed",
    error: { phase: "startup", message: "connection refused", causedBy: "database unavailable" },
  },
  { name: "Degraded", status: "degraded" },
]
const graph = {
  nodes: plugins.map((p) => ({ name: p.name, version: p.version, status: p.status, required: true })),
  edges: [{ source: "System", target: "Broken" }],
}
const reply = (data: unknown) => HttpResponse.json({ code: 0, data })
async function setup() {
  await i18n.changeLanguage("en-US")
  useAuthStore.getState().setToken("access", "plugin-ui")
  useAuthStore.setState({
    userInfo: {
      id: "reader",
      username: "reader",
      name: "Reader",
      email: "",
      isAdmin: false,
      roles: [],
      buttons: ["plugin:read"],
      createTime: "",
      updateTime: "",
    },
  })
  server.use(
    http.get(`${base}/*`, ({ request }) =>
      reply(
        request.url.endsWith("/dependencies")
          ? graph
          : request.url.endsWith("/events")
            ? {
                handlerErrors: { low: 2, high: 7 },
                deadLetterCount: 23,
                deadLetters: [
                  { eventName: "delivery.failed", timestamp: "2026-11-01T01:30:00-04:00", source: "Mailer" },
                  { eventName: "invalid", timestamp: "invalid-time" },
                ],
              }
            : plugins,
      ),
    ),
  )
  renderAdmin(<PluginPage />)
  await screen.findByRole("button", { name: "Expand System" })
  return userEvent.setup()
}
afterEach(() => useAuthStore.getState().clearAuth())
test("summaries and expanded plugin details preserve statuses, dependencies and nested failures", async () => {
  const user = await setup()
  const summary = screen.getByRole("region", { name: "Plugin summary" })
  expect(within(summary).getByText("4")).toBeInTheDocument()
  expect(within(summary).getAllByText("1")).toHaveLength(3)
  expect(screen.getByRole("cell", { name: "0.0 ms" })).toBeInTheDocument()
  await user.click(screen.getByRole("button", { name: "Expand System" }))
  expect(screen.getByText("Core")).toBeInTheDocument()
  expect(screen.getByText("Yes")).toBeInTheDocument()
  await user.click(screen.getByRole("button", { name: "Expand Broken" }))
  expect(screen.getByText("startup")).toBeInTheDocument()
  expect(screen.getByText("connection refused")).toBeInTheDocument()
  expect(screen.getByText("database unavailable")).toBeInTheDocument()
  await user.click(screen.getByRole("button", { name: "Expand Disabled" }))
  expect(screen.getByText("Plugin disabled via plugins.toml")).toBeInTheDocument()
  const errors = screen.getByRole("table", { name: "Handler Errors" })
  expect(
    within(errors)
      .getAllByRole("row")
      .slice(1)
      .map((row) => row.textContent),
  ).toEqual(["high7", "low2"])
  expect(screen.getByText("delivery.failed")).toBeInTheDocument()
  expect(screen.getByText("invalid-time")).toBeInTheDocument()
  expect(screen.getByText("23")).toBeInTheDocument()
})
test("dependency graph preserves arrows, status filtering, version inspection, zoom and reset", async () => {
  const user = await setup()
  const figure = screen.getByRole("figure", { name: "Dependency Graph" })
  expect(figure.querySelectorAll("line[data-dependency]")).toHaveLength(1)
  const node = within(figure).getByRole("button", { name: "System, Loaded, 1.2.3" })
  act(() => node.focus())
  expect(within(figure).getByRole("status")).toHaveTextContent("System")
  await user.click(within(figure).getByRole("button", { name: "Failed" }))
  expect(within(figure).queryByRole("button", { name: "Broken, Failed, -" })).not.toBeInTheDocument()
  expect(figure.querySelectorAll("line[data-dependency]")).toHaveLength(0)
  await user.click(within(figure).getByRole("button", { name: "Zoom in" }))
  expect(within(figure).getByText("125%")).toBeInTheDocument()
  await user.click(within(figure).getByRole("button", { name: "Reset view" }))
  expect(within(figure).getByText("100%")).toBeInTheDocument()
})
test("partial errors expose independent retry and a successful empty refresh removes previous graph and rows", async () => {
  const user = await setup()
  server.use(http.get(`${base}/events`, () => HttpResponse.json({ code: 5010, msg: "Unavailable" })))
  await user.click(screen.getByRole("button", { name: "Refresh" }))
  await screen.findByRole("alert")
  expect(screen.getByRole("button", { name: "Expand System" })).toBeInTheDocument()
  server.use(http.get(`${base}/events`, () => reply({ handlerErrors: {}, deadLetters: [], deadLetterCount: 0 })))
  await user.click(within(screen.getByRole("alert")).getByRole("button", { name: "Retry" }))
  await screen.findByText("No handler errors")
  expect(screen.getByText("No dead letters")).toBeInTheDocument()
  server.use(
    http.get(`${base}/plugins`, () => reply([])),
    http.get(`${base}/plugins/dependencies`, () => reply({ nodes: [], edges: [] })),
  )
  await user.click(screen.getByRole("button", { name: "Refresh" }))
  await waitFor(() => expect(screen.queryByRole("button", { name: "Expand System" })).not.toBeInTheDocument())
  expect(screen.getByRole("figure", { name: "Dependency Graph" }).querySelectorAll("circle")).toHaveLength(0)
})
test("permission revocation immediately removes previously displayed plugin information", async () => {
  await setup()
  act(() => useAuthStore.setState({ userInfo: { ...useAuthStore.getState().userInfo!, buttons: [] } }))
  expect(screen.queryByText("System")).not.toBeInTheDocument()
  expect(screen.getByRole("alert")).toBeInTheDocument()
})
