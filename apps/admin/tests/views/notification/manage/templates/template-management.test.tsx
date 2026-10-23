// @vitest-environment jsdom
import "@test/setup/layout"
import { act, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, expect, test } from "vitest"
import { http, HttpResponse } from "msw"
import { server } from "@test/setup/server"
import { renderAdmin } from "@test/setup/render"
import { useAuthStore } from "@/stores/auth"
import i18n from "@/locales"
import type { NotificationTemplate } from "@/services/api/notification-template"
import TemplatePage from "@/views/notification/manage/templates"
const base = "http://localhost:16000/api/v1/admin/notification-templates"
const first: NotificationTemplate = {
  id: "first",
  code: "welcome",
  name: "Welcome",
  category: "user.invited",
  level: "info",
  contentMode: "raw",
  titleTemplate: "Hello {name}",
  contentTemplate: "Welcome body",
  contentFormat: "plain_text",
  variableSchema: { name: { type: "string", required: true, example: "Ada" } },
  defaultChannels: ["in_app"],
  defaultAction: null,
  mandatory: false,
  enabled: true,
  version: 1,
  createTime: "2026-10-01T00:00:00",
  updateTime: "2026-10-02T00:00:00",
}
const second = {
  ...first,
  id: "second",
  code: "task",
  name: "Task",
  titleTemplate: "Task title",
  contentTemplate: "Task body",
  variableSchema: {},
  enabled: false,
}
function response(records = [first, second], page = 1, total = records.length) {
  return HttpResponse.json({ code: 0, data: { records, page, pageSize: 20, total } })
}
beforeEach(async () => {
  await i18n.changeLanguage("en-US")
  useAuthStore.getState().setToken("access", "template-page-refresh")
  useAuthStore.setState({
    userInfo: {
      id: "admin",
      username: "admin",
      name: "Admin",
      email: "",
      roles: [],
      buttons: [],
      isAdmin: true,
      createTime: "",
      updateTime: "",
    },
  })
  server.use(http.get(base, () => response()))
})
afterEach(() => useAuthStore.getState().clearAuth())
test("list selects the first detail and activates another row by Space with no extra detail request", async () => {
  const user = userEvent.setup()
  renderAdmin(<TemplatePage />)
  await screen.findByText("Welcome body", { selector: "dd" })
  const row = screen.getByRole("button", { name: "View template: Task" }).closest("tr")!
  row.focus()
  await user.keyboard(" ")
  expect(screen.getByText("Task body", { selector: "dd" })).toBeInTheDocument()
  expect(screen.queryByText("Welcome body", { selector: "dd" })).toBeNull()
  expect(row).toHaveAttribute("data-state", "selected")
  expect(row).toHaveAttribute("aria-selected", "true")
})
test("search preserves enabled false, resets the page, and clearing filters restores the initial snapshot", async () => {
  const queries: URLSearchParams[] = []
  server.use(
    http.get(base, ({ request }) => {
      const params = new URL(request.url).searchParams
      queries.push(params)
      return response([first], Number(params.get("page")), 40)
    }),
  )
  const user = userEvent.setup()
  renderAdmin(<TemplatePage />)
  await screen.findByText("Welcome body", { selector: "dd" })
  await user.click(screen.getByRole("button", { name: "Next" }))
  await waitFor(() => expect(queries.at(-1)?.get("page")).toBe("2"))
  await user.type(screen.getByRole("textbox", { name: "Keyword" }), "welcome")
  await user.click(screen.getByRole("combobox", { name: "Status" }))
  await user.click(screen.getByRole("option", { name: "Disabled" }))
  await user.click(screen.getByRole("button", { name: "Search" }))
  await waitFor(() =>
    expect(Object.fromEntries(queries.at(-1)!)).toMatchObject({ page: "1", keyword: "welcome", enabled: "false" }),
  )
  await user.click(screen.getByRole("button", { name: "Reset" }))
  await waitFor(() => expect(queries.at(-1)?.get("keyword")).toBeNull())
})
test("background refresh updates details without replacing an open draft", async () => {
  const user = userEvent.setup()
  const { queryClient } = renderAdmin(<TemplatePage />)
  await user.click(await screen.findByRole("button", { name: "Edit template" }))
  await user.clear(screen.getByRole("textbox", { name: "Template name" }))
  await user.type(screen.getByRole("textbox", { name: "Template name" }), "Local draft")
  server.use(http.get(base, () => response([{ ...first, name: "Remote name" }])))
  await act(() => queryClient.invalidateQueries({ queryKey: ["notification-templates"] }))
  expect(screen.getByRole("textbox", { name: "Template name" })).toHaveValue("Local draft")
  await user.click(screen.getByRole("button", { name: "Cancel" }))
  expect(screen.getByRole("heading", { name: "Remote name" })).toBeInTheDocument()
})
test("delete confirmation survives failures, retries once, and removes the selected detail", async () => {
  let fail = true,
    calls = 0,
    deleted = false
  server.use(
    http.get(base, () => response(deleted ? [second] : [first, second])),
    http.delete(`${base}/first`, () => {
      calls++
      if (!fail) deleted = true
      return HttpResponse.json(fail ? { code: 500, message: "Failed", data: null } : { code: 0, data: null })
    }),
  )
  const user = userEvent.setup()
  renderAdmin(<TemplatePage />)
  await screen.findByText("Welcome body", { selector: "dd" })
  await user.click(screen.getByRole("button", { name: "More actions" }))
  await user.click(await screen.findByRole("menuitem", { name: "Delete" }))
  const dialog = await screen.findByRole("alertdialog")
  expect(within(dialog).getByText(/welcome.*integrations/)).toBeInTheDocument()
  expect(calls).toBe(0)
  await user.click(within(dialog).getByRole("button", { name: "Delete" }))
  await screen.findByText("Could not delete. Please try again.")
  expect(dialog).toBeInTheDocument()
  fail = false
  await user.click(within(dialog).getByRole("button", { name: "Delete" }))
  await screen.findByText("Task body", { selector: "dd" })
  expect(calls).toBe(2)
  expect(screen.queryByRole("alertdialog")).toBeNull()
})
test("read-only permissions hide writes, close revoked dialogs and never revive them on restoration", async () => {
  const user = userEvent.setup()
  renderAdmin(<TemplatePage />)
  await user.click(await screen.findByRole("button", { name: "Edit template" }))
  act(() =>
    useAuthStore.setState({
      userInfo: { ...useAuthStore.getState().userInfo!, isAdmin: false, buttons: ["notification-template:read"] },
    }),
  )
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  expect(screen.queryByRole("button", { name: "New template" })).toBeNull()
  expect(screen.queryByRole("button", { name: "More actions" })).toBeNull()
  expect(screen.getByText("Read-only view; template editing is not permitted.")).toBeInTheDocument()
  act(() => useAuthStore.setState({ userInfo: { ...useAuthStore.getState().userInfo!, isAdmin: true } }))
  expect(screen.queryByRole("dialog")).toBeNull()
})
test("loading, failed retry, empty results and language changes are represented in both panels", async () => {
  let fail = true
  server.use(
    http.get(base, () => (fail ? HttpResponse.json({ code: 500, message: "Failed", data: null }) : response([]))),
  )
  const user = userEvent.setup()
  renderAdmin(<TemplatePage />)
  await screen.findByText("Failed to load data")
  fail = false
  await user.click(screen.getByRole("button", { name: "Retry" }))
  await screen.findByText("No templates to inspect")
  await act(() => i18n.changeLanguage("zh-CN"))
  expect(screen.getByText("暂无可查看的模板")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "新增模板" })).toBeInTheDocument()
})

test("pending deletion blocks repeated submission and closing; revocation clears its confirmation", async () => {
  let release!: () => void,
    calls = 0,
    started = false
  const gate = new Promise<void>((resolve) => (release = resolve))
  server.use(
    http.delete(`${base}/first`, async () => {
      started = true
      calls++
      await gate
      return HttpResponse.json({ code: 0, data: null })
    }),
  )
  const user = userEvent.setup(),
    { queryClient } = renderAdmin(<TemplatePage />)
  await screen.findByText("Welcome body", { selector: "dd" })
  await user.click(screen.getByRole("button", { name: "More actions" }))
  await user.click(await screen.findByRole("menuitem", { name: "Delete" }))
  const dialog = await screen.findByRole("alertdialog")
  try {
    await user.click(within(dialog).getByRole("button", { name: "Delete" }))
    await waitFor(() => expect(started).toBe(true))
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled()
    expect(within(dialog).getByRole("button", { name: "Loading..." })).toBeDisabled()
    await user.keyboard("{Escape}")
    expect(dialog).toBeInTheDocument()
    expect(calls).toBe(1)
    act(() =>
      useAuthStore.setState({
        userInfo: { ...useAuthStore.getState().userInfo!, isAdmin: false, buttons: ["notification-template:read"] },
      }),
    )
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
    act(() => useAuthStore.setState({ userInfo: { ...useAuthStore.getState().userInfo!, isAdmin: true } }))
    expect(screen.queryByRole("alertdialog")).toBeNull()
    release()
    await waitFor(() => expect(queryClient.isMutating()).toBe(0))
    expect(calls).toBe(1)
  } finally {
    release()
  }
})

test("row choice preserves the focused name button for subsequent keyboard navigation", async () => {
  const user = userEvent.setup()
  renderAdmin(<TemplatePage />)
  const button = await screen.findByRole("button", { name: "View template: Task" })
  await user.click(button)
  expect(screen.getByRole("button", { name: "View template: Task" })).toHaveFocus()
  await user.tab()
  expect(screen.getByRole("combobox", { name: "Rows per page" })).toHaveFocus()
})

test("a pending save from a revoked editor cannot close the new draft after permissions are restored", async () => {
  let release!: () => void,
    started = false
  const gate = new Promise<void>((resolve) => (release = resolve))
  server.use(
    http.put(`${base}/first`, async () => {
      started = true
      await gate
      return HttpResponse.json({ code: 0, data: first })
    }),
  )
  const user = userEvent.setup(),
    { queryClient } = renderAdmin(<TemplatePage />)
  await user.click(await screen.findByRole("button", { name: "Edit template" }))
  await user.click(screen.getByRole("button", { name: "Save changes" }))
  try {
    await waitFor(() => expect(started).toBe(true))
    act(() =>
      useAuthStore.setState({
        userInfo: { ...useAuthStore.getState().userInfo!, isAdmin: false, buttons: ["notification-template:read"] },
      }),
    )
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    act(() => useAuthStore.setState({ userInfo: { ...useAuthStore.getState().userInfo!, isAdmin: true } }))
    await user.click(screen.getByRole("button", { name: "Edit template" }))
    await user.clear(screen.getByRole("textbox", { name: "Template name" }))
    await user.type(screen.getByRole("textbox", { name: "Template name" }), "New unsaved draft")
    release()
    await waitFor(() => expect(queryClient.isMutating()).toBe(0))
    expect(screen.getByRole("dialog", { name: "Edit template" })).toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: "Template name" })).toHaveValue("New unsaved draft")
  } finally {
    release()
  }
})
