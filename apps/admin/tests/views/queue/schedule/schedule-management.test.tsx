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
import SchedulePage from "@/views/queue/schedule"
const base = "http://localhost:16000/api/v1/schedules",
  id = "10000000-0000-4000-8000-000000000001",
  record = {
    id,
    name: "Night job",
    task: "sample.job",
    enabled: true,
    description: "Existing",
    schedule: { type: "interval", every: 60, period: "seconds" },
  },
  detail = { ...record, args: ["original"], kwargs: { flag: true } },
  reply = (data: unknown) => HttpResponse.json({ code: 0, data }),
  preview = { valid: true, timezone: "UTC", evaluatedAt: "2026-10-24T00:00:00Z", nextRuns: [], horizonYears: 5 }
async function setup() {
  await i18n.changeLanguage("en-US")
  useAuthStore.getState().setToken("access", "schedule-ui-session")
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
    http.get(base, ({ request }) => {
      requests.push(request.url)
      return reply({
        records: [record],
        total: 60,
        page: Number(new URL(request.url).searchParams.get("page")),
        pageSize: 20,
      })
    }),
    http.get(`${base}/${id}`, () => reply(detail)),
    http.get("http://localhost:16000/api/v1/tasks/registered", () => reply({ tasks: ["sample.job", "other.job"] })),
    http.post(`${base}/preview`, () => reply(preview)),
  )
  const view = renderAdmin(<SchedulePage />, { initialEntries: ["/queue/schedule"] })
  await screen.findByRole("button", { name: "Edit" })
  return { ...view, requests, user: userEvent.setup() }
}
afterEach(() => useAuthStore.getState().clearAuth())
test("filters apply on Search and current draft on pagination/refresh; Reset only clears draft", async () => {
  const { user, requests } = await setup()
  const input = screen.getByRole("textbox", { name: "Celery Task" })
  let count = requests.length
  await user.type(input, "sample")
  expect(requests).toHaveLength(count)
  await user.click(screen.getByRole("button", { name: "Search" }))
  await waitFor(() => expect(new URL(requests.at(-1)!).searchParams.get("taskName")).toBe("sample"))
  await user.click(screen.getByRole("button", { name: "Reset" }))
  count = requests.length
  expect(input).toHaveValue("")
  expect(requests).toHaveLength(count)
  await user.click(screen.getByRole("button", { name: "Next" }))
  await waitFor(() => expect(new URL(requests.at(-1)!).searchParams.get("page")).toBe("2"))
  expect(new URL(requests.at(-1)!).searchParams.has("taskName")).toBe(false)
  await user.type(input, "other")
  await user.click(screen.getByRole("button", { name: "Refresh" }))
  await waitFor(() => expect(new URL(requests.at(-1)!).searchParams.get("taskName")).toBe("other"))
  expect(new URL(requests.at(-1)!).searchParams.get("page")).toBe("2")
})
test("create validates required fields and fresh authoritative preview; rejected writes preserve all inputs", async () => {
  const { user } = await setup()
  let writes = 0,
    body: unknown,
    valid = false
  server.use(
    http.post(`${base}/preview`, () => reply({ ...preview, valid })),
    http.post(base, async ({ request }) => {
      body = await request.json()
      writes++
      return writes === 1 ? HttpResponse.json({ code: 500, msg: "rejected" }) : reply({ ...detail, name: "New" })
    }),
  )
  await user.click(screen.getByRole("button", { name: "Add Scheduled Task" }))
  const drawer = screen.getByRole("dialog", { name: "Add Scheduled Task" }),
    save = within(drawer).getByRole("button", { name: "Save" })
  await user.click(save)
  expect(writes).toBe(0)
  await user.type(within(drawer).getByRole("textbox", { name: "Task Name" }), "New")
  await user.click(within(drawer).getByRole("combobox", { name: "Celery Task" }))
  await user.click(screen.getByRole("option", { name: "sample.job" }))
  await user.click(save)
  expect(writes).toBe(0)
  valid = true
  await user.click(save)
  await within(drawer).findByText("Schedule operation failed. Please retry.")
  expect(within(drawer).getByRole("textbox", { name: "Task Name" })).toHaveValue("New")
  await user.click(save)
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  expect(writes).toBe(2)
  expect(body).toEqual({
    name: "New",
    task: "sample.job",
    description: "",
    enabled: true,
    args: [],
    kwargs: {},
    schedule: { type: "interval", every: 60, period: "seconds" },
  })
})
test("edit detail failure blocks save, retry initializes arguments, background updates retain user draft", async () => {
  const { user, queryClient } = await setup()
  let fail = true
  server.use(
    http.get(`${base}/${id}`, () => (fail ? HttpResponse.json({ code: 500, msg: "unavailable" }) : reply(detail))),
  )
  await user.click(screen.getByRole("button", { name: "Edit" }))
  const drawer = screen.getByRole("dialog", { name: "Edit Scheduled Task" })
  await within(drawer).findByText("Failed to load task arguments. Close and reopen to retry.")
  expect(within(drawer).getByRole("button", { name: "Save" })).toBeDisabled()
  fail = false
  await user.click(within(drawer).getByRole("button", { name: "Retry" }))
  const name = await screen.findByRole("textbox", { name: "Task Name" })
  await user.clear(name)
  await user.type(name, "Draft")
  expect(screen.getByRole("textbox", { name: "Argument value" })).toHaveValue("original")
  server.use(http.get(`${base}/${id}`, () => reply({ ...detail, name: "Server update", args: ["changed"] })))
  await act(async () => {
    await queryClient.refetchQueries({ predicate: (q) => q.queryKey[0] === "schedules" && q.queryKey[2] === "detail" })
  })
  expect(name).toHaveValue("Draft")
  expect(screen.getByRole("textbox", { name: "Argument value" })).toHaveValue("original")
})
test("permission loss while validation is pending closes editor and cannot submit", async () => {
  const { user } = await setup()
  let release!: () => void,
    started = 0,
    writes = 0
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await user.click(screen.getByRole("button", { name: "Edit" }))
  const drawer = screen.getByRole("dialog", { name: "Edit Scheduled Task" })
  await within(drawer).findByRole("textbox", { name: "Task Name" })
  await waitFor(() => expect(within(drawer).getByRole("button", { name: "Save" })).toBeEnabled())
  server.use(
    http.post(`${base}/preview`, async () => {
      started++
      await gate
      return reply(preview)
    }),
    http.put(`${base}/${id}`, () => {
      writes++
      return reply(detail)
    }),
  )
  await user.click(within(drawer).getByRole("button", { name: "Save" }))
  await waitFor(() => expect(started).toBeGreaterThan(0))
  act(() =>
    useAuthStore.setState((state) => ({
      userInfo: state.userInfo ? { ...state.userInfo, isAdmin: false, buttons: ["schedule:read"] } : null,
    })),
  )
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  await act(async () => release())
  expect(writes).toBe(0)
  expect(screen.queryByRole("button", { name: "Edit" })).toBeNull()
  expect(screen.getByRole("switch")).toHaveAttribute("aria-disabled", "true")
  await user.click(screen.getByRole("switch"))
  expect(writes).toBe(0)
})
test("toggle and confirmed delete send exact commands, failures stay retryable and no batch controls exist", async () => {
  const { user } = await setup()
  let toggles = 0,
    deletes = 0
  server.use(
    http.patch(`${base}/${id}/toggle`, () => {
      toggles++
      return reply({ ...detail, enabled: false })
    }),
    http.delete(`${base}/${id}`, () => {
      deletes++
      return reply(deletes > 1)
    }),
  )
  expect(screen.queryByRole("checkbox")).toBeNull()
  await user.click(screen.getByRole("switch"))
  await waitFor(() => expect(toggles).toBe(1))
  await user.click(screen.getByRole("button", { name: "Delete" }))
  await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete" }))
  await screen.findByText("Schedule operation failed. Please retry.")
  expect(deletes).toBe(1)
  await user.click(screen.getByRole("button", { name: "Delete" }))
  await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete" }))
  await waitFor(() => expect(deletes).toBe(2))
})

test("a failed background detail refresh preserves the draft but locks saving until a successful retry", async () => {
  const { user, queryClient } = await setup()
  await user.click(screen.getByRole("button", { name: "Edit" }))
  await screen.findByRole("textbox", { name: "Task Name" })
  const name = screen.getByRole("textbox", { name: "Task Name" })
  await user.clear(name)
  await user.type(name, "Unsent draft")
  server.use(http.get(`${base}/${id}`, () => HttpResponse.json({ code: 500, msg: "failed" })))
  await act(async () => {
    await queryClient.refetchQueries({ predicate: (q) => q.queryKey[0] === "schedules" && q.queryKey[2] === "detail" })
  })
  expect(name).toHaveValue("Unsent draft")
  await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeDisabled())
  server.use(http.get(`${base}/${id}`, () => reply({ ...detail, args: ["new server args"] })))
  await user.click(screen.getByRole("button", { name: "Retry" }))
  await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeEnabled())
  expect(name).toHaveValue("Unsent draft")
  expect(screen.getByRole("textbox", { name: "Argument value" })).toHaveValue("original")
})
test("registered task failure offers retry, preserves draft, and never falls back to cached options", async () => {
  const { user } = await setup()
  server.use(
    http.get("http://localhost:16000/api/v1/tasks/registered", () => HttpResponse.json({ code: 500, msg: "failed" })),
  )
  await user.click(screen.getByRole("button", { name: "Add Scheduled Task" }))
  await screen.findByText("Registered tasks could not be loaded. Retry before saving.")
  const name = screen.getByRole("textbox", { name: "Task Name" })
  await user.type(name, "Draft without choices")
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled()
  server.use(http.get("http://localhost:16000/api/v1/tasks/registered", () => reply({ tasks: ["other.job"] })))
  await user.click(screen.getByRole("button", { name: "Retry" }))
  await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeEnabled())
  expect(name).toHaveValue("Draft without choices")
  await user.click(screen.getByRole("combobox", { name: "Celery Task" }))
  expect(screen.queryByRole("option", { name: "sample.job" })).toBeNull()
  expect(screen.getByRole("option", { name: "other.job" })).toBeInTheDocument()
})

test("a delayed toggle refreshes the current filters instead of restoring the click-time draft", async () => {
  const { user, requests } = await setup()
  let release!: () => void,
    calls = 0
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  server.use(
    http.patch(`${base}/${id}/toggle`, async () => {
      calls++
      await gate
      return reply({ ...detail, enabled: false })
    }),
  )
  const task = screen.getByRole("textbox", { name: "Celery Task" })
  await user.type(task, "unapplied")
  await user.click(screen.getByRole("switch"))
  await waitFor(() => expect(calls).toBe(1))
  await user.clear(task)
  await user.type(task, "current")
  await user.click(screen.getByRole("button", { name: "Search" }))
  await waitFor(() => expect(new URL(requests.at(-1)!).searchParams.get("taskName")).toBe("current"))
  await act(async () => release())
  await waitFor(() => expect(screen.getByRole("switch")).not.toHaveAttribute("aria-disabled", "true"))
  expect(new URL(requests.at(-1)!).searchParams.get("taskName")).toBe("current")
  expect(task).toHaveValue("current")
})

test("deleting the last visible record on a later page requests the previous page", async () => {
  const { user, requests } = await setup()
  server.use(http.delete(`${base}/${id}`, () => reply(true)))
  await user.click(screen.getByRole("button", { name: "Next" }))
  await waitFor(() => expect(new URL(requests.at(-1)!).searchParams.get("page")).toBe("2"))
  await waitFor(() => expect(screen.getByRole("button", { name: "Delete" })).toBeEnabled())
  await user.click(screen.getByRole("button", { name: "Delete" }))
  await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete" }))
  await waitFor(() => expect(new URL(requests.at(-1)!).searchParams.get("page")).toBe("1"))
})

test("the first edit snapshot consistently uses fresh detail metadata and preserves another admin's disabled status", async () => {
  const { user } = await setup()
  server.use(
    http.get(`${base}/${id}`, () =>
      reply({ ...detail, name: "Fresh name", task: "other.job", description: "Fresh description", enabled: false }),
    ),
  )
  await user.click(screen.getByRole("button", { name: "Edit" }))
  const name = await screen.findByRole("textbox", { name: "Task Name" })
  expect(name).toHaveValue("Fresh name")
  const drawer = screen.getByRole("dialog", { name: "Edit Scheduled Task" })
  expect(within(drawer).getByRole("textbox", { name: "Description" })).toHaveValue("Fresh description")
  expect(within(drawer).getByRole("combobox", { name: "Celery Task" })).toHaveTextContent("other.job")
  expect(within(drawer).getByRole("switch", { name: "Enabled" })).toHaveAttribute("aria-checked", "false")
  let saved: unknown
  server.use(
    http.put(`${base}/${id}`, async ({ request }) => {
      saved = await request.json()
      return reply(detail)
    }),
  )
  await user.click(within(drawer).getByRole("button", { name: "Save" }))
  await waitFor(() =>
    expect(saved).toMatchObject({
      name: "Fresh name",
      task: "other.job",
      description: "Fresh description",
      enabled: false,
    }),
  )
})
test("existing solar coordinates retain all valid decimal precision and can be saved without native step restrictions", async () => {
  const { user } = await setup(),
    schedule = { type: "solar", event: "sunrise", latitude: 31.23041234, longitude: 121.47371234 }
  server.use(http.get(`${base}/${id}`, () => reply({ ...detail, schedule })))
  let saved: unknown
  server.use(
    http.put(`${base}/${id}`, async ({ request }) => {
      saved = await request.json()
      return reply(detail)
    }),
  )
  await user.click(screen.getByRole("button", { name: "Edit" }))
  await screen.findByRole("spinbutton", { name: "Latitude" })
  expect(screen.getByRole("spinbutton", { name: "Latitude" })).toHaveValue(schedule.latitude)
  expect(screen.getByRole("spinbutton", { name: "Longitude" })).toHaveValue(schedule.longitude)
  await user.click(screen.getByRole("button", { name: "Save" }))
  await waitFor(() => expect(saved).toMatchObject({ schedule }))
})
