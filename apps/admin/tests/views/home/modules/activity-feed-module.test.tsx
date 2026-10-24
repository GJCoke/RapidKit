// @vitest-environment jsdom
import "@test/setup/layout"
import { screen, within, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, test, vi } from "vitest"
import { http, HttpResponse } from "msw"
import { server } from "@test/setup/server"
import { renderAdmin } from "@test/setup/render"
import { homeActivity } from "@test/setup/home-fixtures"
import { useAuthStore } from "@/stores/auth"
import i18n from "@/locales"
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
import { ActivityFeedModule } from "@/views/home/modules/activity-feed-module"
test("activities show five rows, all twenty in the drawer, full detail, and category requests replace the rows", async () => {
  const user = await setup(["dashboard.activity"])
  server.use(
    http.get(`${base}/system/activities`, ({ request }) => {
      const category = new URL(request.url).searchParams.get("categories")
      return reply({
        items: category
          ? [homeActivity("filtered", "user")]
          : Array.from({ length: 20 }, (_, i) => homeActivity(`task-${i}`)),
        size: 20,
        nextCursor: null,
      })
    }),
  )
  renderAdmin(<ActivityFeedModule />)
  expect(await screen.findByText("Task “task-0” succeeded in 1.24 seconds")).toBeInTheDocument()
  expect(screen.queryByText(/task-5/)).not.toBeInTheDocument()
  await user.click(screen.getByRole("button", { name: "View all activity" }))
  const drawer = await screen.findByRole("dialog", { name: "All Activity" })
  expect(within(drawer).getAllByRole("button", { name: /Task “task-/ })).toHaveLength(20)
  await user.click(within(drawer).getByRole("button", { name: /task-19/ }))
  const detail = await screen.findByRole("dialog", { name: "Activity Details" })
  expect(within(detail).getByText("task.succeeded")).toBeInTheDocument()
  expect(within(detail).getByText("Reason: Fixture detail")).toBeInTheDocument()
  expect(within(detail).getByText("Operator")).toBeInTheDocument()
  await user.keyboard("{Escape}")
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Activity Details" })).not.toBeInTheDocument())
  await user.keyboard("{Escape}")
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "All Activity" })).not.toBeInTheDocument())
  await user.click(screen.getByRole("button", { name: "Users" }))
  expect(await screen.findByText("Task “filtered” succeeded in 1.24 seconds")).toBeInTheDocument()
  expect(screen.queryByText(/task-0/)).not.toBeInTheDocument()
})
