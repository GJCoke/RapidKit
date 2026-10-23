// @vitest-environment jsdom
import "@test/setup/layout"
import { act, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, test, vi } from "vitest"
import { http, HttpResponse } from "msw"
import { useLocation, useNavigate } from "react-router"
import { server } from "@test/setup/server"
import { renderAdmin } from "@test/setup/render"
import { taskRecord, taskDetail } from "@test/setup/task-fixtures"
import { useAuthStore } from "@/stores/auth"
import i18n from "@/locales"
import TaskPage from "@/views/queue/task"
import * as actions from "@/shared/code-viewers/text-actions"
const base = "http://localhost:16000/api/v1/tasks",
  reply = (data: unknown) => HttpResponse.json({ code: 0, data })
function Location() {
  const navigate = useNavigate()
  return (
    <>
      <output aria-label="url">{useLocation().search}</output>
      <button
        onClick={() =>
          void navigate(
            "?view=records&keyword=external&worker=outside&status=4&range=custom&startTime=2026-10-01T00%3A00%3A00Z&endTime=2026-10-02T00%3A00%3A00Z",
          )
        }
      >
        External navigation
      </button>
      <button onClick={() => void navigate(-1)}>Browser back</button>
    </>
  )
}
async function setup(url = "/queue/task") {
  await i18n.changeLanguage("en-US")
  useAuthStore.getState().setToken("access", "task-ui-session")
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
        records: [taskRecord()],
        total: 60,
        page: Number(new URL(request.url).searchParams.get("page")),
        pageSize: 20,
      })
    }),
    http.get(`${base}/stats/by-name`, () =>
      reply({
        records: [
          {
            taskName: "job",
            total: 4,
            success: 2,
            failure: 1,
            inProgress: 1,
            successRate: 66.7,
            lastExecutedAt: "2026-10-24T00:00:00Z",
            avgRuntime: 1,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      }),
    ),
    http.get(`${base}/registered`, () => reply({ tasks: ["job", "other"] })),
    http.get(`${base}/:id`, () => reply(taskDetail())),
  )
  const view = renderAdmin(
    <>
      <TaskPage />
      <Location />
    </>,
    { initialEntries: [url] },
  )
  await screen.findByRole("button", { name: "Detail" })
  return { ...view, requests, user: userEvent.setup() }
}
afterEach(() => useAuthStore.getState().clearAuth())
test("draft search applies only on Search; group failure drill and back retain group URL state", async () => {
  const { user, requests } = await setup("/queue/task?foreign=keep&groupPage=2&groupSize=50")
  const count = requests.length
  await user.type(screen.getByRole("textbox", { name: "Worker" }), "new-worker")
  expect(requests).toHaveLength(count)
  await user.click(screen.getByRole("button", { name: "Search" }))
  await waitFor(() => expect(requests.at(-1)).toContain("workerHostname=new-worker"))
  await user.click(screen.getByRole("button", { name: "Task summary" }))
  const table = screen.getByRole("table")
  await user.click(await within(table).findByRole("button", { name: "1" }))
  await waitFor(() => expect(screen.getByLabelText("url")).toHaveTextContent("task=job"))
  expect(screen.getByLabelText("url")).toHaveTextContent("status=4")
  expect(screen.getByLabelText("url")).toHaveTextContent("foreign=keep")
  expect(screen.getByRole("textbox", { name: "Task Name" })).toBeDisabled()
  await user.click(screen.getByRole("button", { name: "Back to task summary" }))
  expect(screen.getByLabelText("url")).toHaveTextContent("view=groups")
  expect(screen.getByLabelText("url")).not.toHaveTextContent("task=job")
})
test("pagination stays outside URL and refresh renews preset time without resetting record page", async () => {
  const { user, requests } = await setup()
  await user.click(screen.getByRole("button", { name: "Next" }))
  await waitFor(() => expect(requests.at(-1)).toContain("page=2"))
  await user.click(screen.getByRole("button", { name: "Refresh" }))
  await waitFor(() => expect(requests.at(-1)).toContain("page=2"))
  expect(screen.getByLabelText("url")).not.toHaveTextContent("page=2")
  await user.click(screen.getByRole("button", { name: "Search" }))
  await waitFor(() => expect(new URL(requests.at(-1)!).searchParams.get("page")).toBe("1"))
})
test("task details retain all information and expand stack logs safely", async () => {
  const { user } = await setup()
  server.use(
    http.get(`${base}/:id`, () =>
      reply(taskDetail({ status: "4", exception: "<script>failed</script>", traceback: "line one\nline two" })),
    ),
  )
  const copy = vi.spyOn(actions, "copyText").mockResolvedValue()
  await user.click(screen.getByRole("button", { name: "Detail" }))
  const drawer = await screen.findByRole("dialog", { name: "Task Detail" })
  await within(drawer).findByText("<script>failed</script>")
  await user.click(within(drawer).getByRole("button", { name: "Copy exception" }))
  expect(copy).toHaveBeenCalledWith("<script>failed</script>")
  await user.click(within(drawer).getByText("Traceback", { exact: true }))
  expect(await within(drawer).findByRole("log", { name: "Traceback" })).toHaveTextContent("line one")
  expect(within(drawer).getByRole("region", { name: "Result" })).toBeInTheDocument()
  expect(within(drawer).getByRole("log", { name: "Execution Logs" })).toHaveTextContent("finished")
})
test("trigger rejects missing choice and invalid arguments, preserves backend failure input, and submits a valid payload", async () => {
  const { user } = await setup()
  let calls = 0,
    body: unknown
  server.use(
    http.post(`${base}/trigger`, async ({ request }) => {
      body = await request.json()
      calls++
      return calls === 1 ? HttpResponse.json({ code: 500, msg: "rejected" }) : reply({ taskId: "new" })
    }),
  )
  await user.click(screen.getByRole("button", { name: "Trigger Task" }))
  const dialog = screen.getByRole("dialog", { name: "Trigger Task" })
  await user.click(within(dialog).getByRole("button", { name: "Confirm" }))
  expect(calls).toBe(0)
  await user.click(within(dialog).getByRole("combobox", { name: "Task Name" }))
  await user.click(screen.getByRole("option", { name: "job" }))
  const kwargs = within(dialog).getByRole("region", { name: "Keyword arguments" })
  await user.click(within(kwargs).getByRole("button", { name: "Add argument" }))
  await user.click(within(dialog).getByRole("button", { name: "Confirm" }))
  expect(calls).toBe(0)
  await user.type(within(kwargs).getByRole("textbox", { name: "Keyword name" }), "flag")
  await user.type(within(kwargs).getByRole("textbox", { name: "Argument value" }), "yes")
  await user.click(within(dialog).getByRole("button", { name: "Confirm" }))
  await within(dialog).findByText("Task operation failed. Please retry.")
  expect(within(kwargs).getByRole("textbox", { name: "Argument value" })).toHaveValue("yes")
  await user.click(within(dialog).getByRole("button", { name: "Confirm" }))
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Trigger Task" })).toBeNull())
  expect(body).toEqual({ taskName: "job", args: [], kwargs: { flag: "yes" } })
  expect(calls).toBe(2)
})
test("permission loss closes write UI and removes actions while keeping readable records", async () => {
  const { user } = await setup()
  await user.click(screen.getByRole("button", { name: "Revoke Task" }))
  expect(screen.getByRole("alertdialog")).toBeInTheDocument()
  act(() =>
    useAuthStore.setState((state) => ({
      userInfo: state.userInfo ? { ...state.userInfo, isAdmin: false, buttons: ["task:read"] } : null,
    })),
  )
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
  expect(screen.queryByRole("button", { name: "Trigger Task" })).toBeNull()
  expect(screen.queryByRole("button", { name: "Revoke Task" })).toBeNull()
  expect(screen.getByRole("button", { name: "Detail" })).toBeInTheDocument()
})

test("external URL navigation and browser history replace both applied filters and draft inputs", async () => {
  const { user, requests } = await setup("/queue/task?keyword=initial")
  await user.type(screen.getByRole("textbox", { name: "Worker" }), "unsaved")
  await user.click(screen.getByRole("button", { name: "External navigation" }))
  await waitFor(() => expect(new URL(requests.at(-1)!).searchParams.get("workerHostname")).toBe("outside"))
  expect(screen.getByRole("textbox", { name: "Task Name" })).toHaveValue("external")
  expect(screen.getByRole("textbox", { name: "Worker" })).toHaveValue("outside")
  expect(screen.getByLabelText("url")).toHaveTextContent("range=custom")
  await user.click(screen.getByRole("button", { name: "Browser back" }))
  await waitFor(() => expect(screen.getByRole("textbox", { name: "Task Name" })).toHaveValue("initial"))
  expect(screen.getByRole("textbox", { name: "Worker" })).toHaveValue("")
})

test.each([
  { traceback: null, message: "No exception details were recorded" },
  { traceback: "stack only", message: "No exception message was recorded. Expand the traceback for details." },
])("failed task with absent exception message exposes $message", async ({ traceback, message }) => {
  const { user } = await setup()
  server.use(http.get(`${base}/:id`, () => reply(taskDetail({ status: "4", exception: null, traceback }))))
  await user.click(screen.getByRole("button", { name: "Detail" }))
  const drawer = await screen.findByRole("dialog", { name: "Task Detail" })
  await within(drawer).findByText(message)
  expect(within(drawer).queryByRole("button", { name: "Copy exception" })).toBeNull()
})
