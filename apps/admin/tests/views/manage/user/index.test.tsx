// @vitest-environment jsdom
import "@test/setup/layout"
import { act, render, screen, waitFor, within } from "@testing-library/react"
import { QueryClientProvider } from "@tanstack/react-query"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, test } from "vitest"
import { http, HttpResponse } from "msw"
import { server } from "@test/setup/server"
import { createTestQueryClient, renderAdmin } from "@test/setup/render"
import { useAuthStore } from "@/stores/auth"
import { useAppStore } from "@/stores/app"
import type { User } from "@/services/api/user"
import type { PermissionCode } from "@/typings/permission-codes"
import i18n from "@/locales"
import UserManagementPage from "@/views/manage/user"

const base = "http://localhost:16000/api/v1"
const alice: User = {
  id: "alice",
  name: "Alice",
  username: "alice",
  email: "alice@example.test",
  roles: ["READER"],
  isAdmin: false,
  departmentId: "research",
  status: "1",
  createTime: "",
  updateTime: "",
}
const bob: User = { ...alice, id: "bob", name: "Bob", username: "bob", status: "3", departmentId: null }
const admin: User = { ...alice, id: "admin", name: "Admin", username: "admin", isAdmin: true, roles: [] }
Object.defineProperty(Element.prototype, "getAnimations", { configurable: true, value: () => [] })
afterEach(() => {
  useAuthStore.getState().clearAuth()
  useAppStore.getState().setIsMobile(false)
})
async function setup(isAdmin = true, buttons: PermissionCode[] = []) {
  await i18n.changeLanguage("en-US")
  useAuthStore.getState().setToken("actor-access", "user-workbench-refresh")
  useAuthStore.setState({
    userInfo: {
      id: "admin",
      username: "admin",
      name: "Admin",
      email: "admin@example.test",
      isAdmin,
      roles: [],
      buttons,
      createTime: "",
      updateTime: "",
    },
  })
  const queries: URL[] = []
  const state = { records: [alice, bob, admin] }
  server.use(
    http.get(`${base}/users`, ({ request }) => {
      const url = new URL(request.url)
      queries.push(url)
      return HttpResponse.json({
        code: 0,
        data: {
          records: state.records,
          total: 43,
          page: Number(url.searchParams.get("page")),
          pageSize: Number(url.searchParams.get("pageSize")),
        },
      })
    }),
    http.get(`${base}/departments/tree`, () =>
      HttpResponse.json({
        code: 0,
        data: [
          {
            id: "org",
            name: "Organization",
            code: "org",
            parentId: null,
            sort: 0,
            status: "1",
            createTime: "",
            updateTime: "",
            children: [
              {
                id: "research",
                name: "Research",
                code: "research",
                parentId: "org",
                sort: 0,
                status: "1",
                createTime: "",
                updateTime: "",
                children: [],
              },
            ],
          },
        ],
      }),
    ),
    http.get(`${base}/users/department-counts`, () =>
      HttpResponse.json({ code: 0, data: { total: 3, unassigned: 1, departments: { research: 2 } } }),
    ),
    http.get(`${base}/roles/all`, () =>
      HttpResponse.json({ code: 0, data: [{ id: "reader", code: "READER", name: "Reader" }] }),
    ),
    http.get(`${base}/users/all`, () => HttpResponse.json({ code: 0, data: [] })),
  )
  return { user: userEvent.setup(), queries, state }
}
async function row(name: string) {
  return (await screen.findByRole("checkbox", { name: `Select ${name}` })).closest("tr")!
}
async function more(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(within(await row(name)).getByRole("button", { name: `${name} actions` }))
}
test("localized directory/table includes combined identity, administrator badge, full department paths and a 20-row default", async () => {
  const { queries } = await setup()
  renderAdmin(<UserManagementPage />)
  expect(await screen.findByRole("heading", { name: "User management" })).toBeInTheDocument()
  expect(within(await row("Alice")).getByText("Organization / Research")).toBeInTheDocument()
  expect(within(await row("Admin")).getByText("Administrator")).toBeInTheDocument()
  expect(screen.getByRole("columnheader", { name: "User" })).toBeInTheDocument()
  expect(screen.queryByRole("columnheader", { name: "Name" })).not.toBeInTheDocument()
  expect(queries[0].searchParams.get("pageSize")).toBe("20")
  expect(await screen.findByRole("button", { name: "Select Research" })).toBeInTheDocument()
})
test("department navigation applies draft filters, resets selection/page, supports descendants and preserves scope on reset", async () => {
  const { user, queries } = await setup()
  renderAdmin(<UserManagementPage />)
  await user.click(await screen.findByRole("checkbox", { name: "Select Alice" }))
  await user.type(screen.getByRole("textbox", { name: "Keyword" }), "Alice")
  await user.click(screen.getByRole("combobox", { name: "User status" }))
  await user.click(await screen.findByRole("option", { name: "Pending" }))
  expect(queries.at(-1)?.searchParams.get("keyword")).toBeNull()
  await user.click(await screen.findByRole("button", { name: "Select Research" }))
  await waitFor(() => expect(queries.at(-1)?.searchParams.get("departmentId")).toBe("research"))
  expect(queries.at(-1)?.searchParams.get("keyword")).toBe("Alice")
  expect(queries.at(-1)?.searchParams.get("status")).toBe("3")
  expect(queries.at(-1)?.searchParams.get("includeChildren")).toBe("true")
  expect(screen.getByRole("heading", { name: "Research" })).toBeInTheDocument()
  expect(screen.getByLabelText("Selected department path")).toHaveTextContent("Organization / Research")
  expect(screen.getByText("43 members")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Batch delete" })).toBeDisabled()
  await user.click(screen.getByRole("checkbox", { name: "Include child departments" }))
  await waitFor(() => expect(queries.at(-1)?.searchParams.get("includeChildren")).toBe("false"))
  await user.click(screen.getByRole("button", { name: "Reset" }))
  await waitFor(() => expect(queries.at(-1)?.searchParams.get("keyword")).toBeNull())
  expect(queries.at(-1)?.searchParams.get("status")).toBeNull()
  expect(queries.at(-1)?.searchParams.get("departmentId")).toBe("research")
})
test("changing page immediately prevents selecting or deleting the previous page's users", async () => {
  const { user } = await setup()
  let release!: () => void,
    requested = false
  const gate = new Promise<void>((r) => {
    release = r
  })
  server.use(
    http.get(`${base}/users`, async ({ request }) => {
      const page = Number(new URL(request.url).searchParams.get("page"))
      if (page === 2) {
        requested = true
        await gate
      }
      return HttpResponse.json({
        code: 0,
        data: { records: page === 2 ? [bob] : [alice], total: 43, page, pageSize: 20 },
      })
    }),
  )
  renderAdmin(<UserManagementPage />)
  await user.click(await screen.findByRole("checkbox", { name: "Select Alice" }))
  await user.click(screen.getByRole("button", { name: "Next" }))
  try {
    await waitFor(() => expect(requested).toBe(true))
    expect(screen.queryByRole("checkbox", { name: "Select Alice" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Batch delete" })).toBeDisabled()
  } finally {
    act(() => release())
  }
  expect(within(await row("Bob")).getByText("21")).toBeInTheDocument()
})
test("delete confirmations keep server errors visible, prevent duplicate writes and retry the same target", async () => {
  const { user, state } = await setup()
  let deletes = 0,
    release!: () => void,
    requested = false
  const gate = new Promise<void>((r) => {
    release = r
  })
  server.use(
    http.delete(`${base}/users/alice`, async () => {
      deletes++
      if (deletes === 1) {
        requested = true
        await gate
        return HttpResponse.json({ code: 15001, message: "Cannot delete", data: null })
      }
      state.records = state.records.filter((record) => record.id !== "alice")
      return HttpResponse.json({ code: 0, data: true })
    }),
  )
  renderAdmin(<UserManagementPage />)
  await more(user, "Alice")
  await user.click(await screen.findByRole("menuitem", { name: "Delete" }))
  const dialog = await screen.findByRole("alertdialog", { name: "Delete user" })
  const confirm = within(dialog).getByRole("button", { name: "Delete" })
  await user.click(confirm)
  try {
    await waitFor(() => expect(requested).toBe(true))
    await user.click(confirm)
    expect(deletes).toBe(1)
  } finally {
    act(() => release())
  }
  await waitFor(() => expect(dialog).toHaveTextContent("Deletion failed. You can retry or cancel."))
  await user.click(within(dialog).getByRole("button", { name: "Delete" }))
  await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument())
  expect(deletes).toBe(2)
})
test("simulation is offered only for an eligible active non-admin and opens the actual confirmation", async () => {
  const { user } = await setup()
  renderAdmin(<UserManagementPage />)
  await more(user, "Alice")
  await user.click(await screen.findByRole("menuitem", { name: "Start impersonation" }))
  const dialog = await screen.findByRole("dialog", { name: "Confirm impersonation" })
  expect(within(dialog).getByText("Organization / Research")).toBeInTheDocument()
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }))
  await more(user, "Bob")
  expect(screen.queryByRole("menuitem", { name: "Start impersonation" })).not.toBeInTheDocument()
  expect(await screen.findByRole("menuitem", { name: "Resend invitation" })).toBeInTheDocument()
})
test("resend retains the source update entry but explains the API's additional create permission", async () => {
  const { user } = await setup(false, ["user:read", "user:update", "department:read"])
  renderAdmin(<UserManagementPage />)
  await more(user, "Bob")
  const invite = await screen.findByRole("menuitem", { name: "Resend invitation" })
  expect(invite).toHaveAttribute("aria-disabled", "true")
  expect(screen.getByText("Resending invitations also requires permission to create users.")).toBeInTheDocument()
  expect(screen.queryByRole("menuitem", { name: "Start impersonation" })).not.toBeInTheDocument()
})
test("read revocation removes the workbench and a mobile directory opens and closes after selection", async () => {
  const { user } = await setup(false, ["user:read", "department:read"])
  useAppStore.getState().setIsMobile(true)
  renderAdmin(<UserManagementPage />)
  await row("Alice")
  expect(screen.queryByRole("button", { name: "Select Research" })).not.toBeInTheDocument()
  await user.click(screen.getByRole("button", { name: "Show departments" }))
  await user.click(await screen.findByRole("button", { name: "Select Research" }))
  expect(screen.queryByRole("button", { name: "Select Research" })).not.toBeInTheDocument()
  act(() => useAuthStore.setState((state) => ({ userInfo: state.userInfo && { ...state.userInfo, buttons: [] } })))
  expect(screen.queryByRole("table")).not.toBeInTheDocument()
  expect(screen.getByRole("alert")).toHaveTextContent("You do not have permission to read users.")
})

test("a deleted mobile department falls back while its panel is closed and clears only the inherited field in an open create draft", async () => {
  const { user, queries } = await setup()
  useAppStore.getState().setIsMobile(true)
  renderAdmin(<UserManagementPage />)
  await row("Alice")
  await user.type(screen.getByRole("textbox", { name: "Keyword" }), "Alice")
  await user.click(screen.getByRole("button", { name: "Show departments" }))
  await user.click(await screen.findByRole("button", { name: "Select Research" }))
  await row("Alice")
  expect(screen.queryByRole("button", { name: "Select Research" })).not.toBeInTheDocument()
  await user.click(screen.getByRole("button", { name: "Next" }))
  await row("Alice")
  await user.click(screen.getByRole("checkbox", { name: "Select Alice" }))
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  server.use(
    http.get(`${base}/departments/tree`, async () => {
      await gate
      return HttpResponse.json({ code: 0, data: [] })
    }),
  )
  await user.click(screen.getByRole("button", { name: "Add user" }))
  const drawer = await screen.findByRole("dialog", { name: "Add user" })
  await user.type(within(drawer).getByRole("textbox", { name: "Email" }), "draft@example.test")
  act(() => release())
  await waitFor(() => expect(queries.at(-1)?.searchParams.get("departmentId")).toBeNull())
  expect(queries.at(-1)?.searchParams.get("page")).toBe("1")
  expect(queries.at(-1)?.searchParams.get("keyword")).toBe("Alice")
  await waitFor(() =>
    expect(within(drawer).getByRole("combobox", { name: "Department" })).toHaveTextContent("Unassigned"),
  )
  expect(within(drawer).getByRole("textbox", { name: "Email" })).toHaveValue("draft@example.test")
  await user.click(within(drawer).getByRole("button", { name: "Cancel" }))
  expect(await screen.findByRole("heading", { name: "All users" })).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Batch delete" })).toBeDisabled()
})

test("batch deletion submits exactly the selected current users and permission revocation closes an unconfirmed delete", async () => {
  const { user, state } = await setup()
  const calls: unknown[] = []
  server.use(
    http.delete(`${base}/users`, async ({ request }) => {
      calls.push(await request.json())
      state.records = [admin]
      return HttpResponse.json({ code: 0, data: true })
    }),
  )
  renderAdmin(<UserManagementPage />)
  await user.click(await screen.findByRole("checkbox", { name: "Select Alice" }))
  await user.click(screen.getByRole("checkbox", { name: "Select Bob" }))
  await user.click(screen.getByRole("button", { name: "Batch delete" }))
  const dialog = await screen.findByRole("alertdialog", { name: "Batch delete" })
  await user.click(within(dialog).getByRole("button", { name: "Delete" }))
  await waitFor(() => expect(calls).toEqual([{ ids: ["alice", "bob"] }]))
  await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument())
  await more(user, "Admin")
  await user.click(await screen.findByRole("menuitem", { name: "Delete" }))
  await screen.findByRole("alertdialog", { name: "Delete user" })
  act(() =>
    useAuthStore.setState((state) => ({
      userInfo: state.userInfo && { ...state.userInfo, isAdmin: false, buttons: ["user:read", "department:read"] },
    })),
  )
  await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument())
  expect(calls).toHaveLength(1)
  expect(screen.queryByRole("columnheader", { name: "Actions" })).not.toBeInTheDocument()
})
test("resending an invitation uses the real mutation once and refreshes directory counts", async () => {
  const { user } = await setup()
  let counts = 0
  server.use(
    http.get(`${base}/users/department-counts`, () => {
      counts++
      return HttpResponse.json({ code: 0, data: { total: 3, unassigned: 1, departments: { research: 2 } } })
    }),
  )
  let calls = 0,
    release!: () => void
  const gate = new Promise<void>((r) => {
    release = r
  })
  server.use(
    http.post(`${base}/users/bob/resend-invite`, async () => {
      calls++
      await gate
      return HttpResponse.json({ code: 0, data: true })
    }),
  )
  const view = renderAdmin(<UserManagementPage />)
  await more(user, "Bob")
  await user.click(await screen.findByRole("menuitem", { name: "Resend invitation" }))
  try {
    await waitFor(() => expect(calls).toBe(1))
    await more(user, "Bob")
    expect(await screen.findByRole("menuitem", { name: "Resend invitation" })).toHaveAttribute("aria-disabled", "true")
    expect(calls).toBe(1)
  } finally {
    act(() => release())
  }
  await user.keyboard("{Escape}")
  await waitFor(() => expect(counts).toBe(2))
  await waitFor(() => expect(view.queryClient.isMutating()).toBe(0))
  await waitFor(() => expect(screen.getByRole("button", { name: "Batch delete" })).toBeDisabled())
})
test("a new user inherits the selected department while list errors retry without actionable stale rows", async () => {
  const { user } = await setup()
  const view = renderAdmin(<UserManagementPage />)
  await row("Alice")
  await user.click(await screen.findByRole("button", { name: "Select Research" }))
  await row("Alice")
  await user.click(screen.getByRole("button", { name: "Add user" }))
  const drawer = await screen.findByRole("dialog", { name: "Add user" })
  await waitFor(() =>
    expect(within(drawer).getByRole("combobox", { name: "Department" })).toHaveTextContent("Organization / Research"),
  )
  await user.click(within(drawer).getByRole("button", { name: "Cancel" }))
  view.queryClient.setDefaultOptions({ queries: { retry: false }, mutations: { retry: false } })
  server.use(http.get(`${base}/users`, () => HttpResponse.json({ code: 15001, data: null })))
  await user.click(screen.getByRole("button", { name: "Refresh" }))
  expect(await screen.findByText("Failed to load data")).toBeInTheDocument()
  expect(screen.queryByRole("checkbox", { name: "Select Alice" })).not.toBeInTheDocument()
  server.use(
    http.get(`${base}/users`, () =>
      HttpResponse.json({ code: 0, data: { records: [], total: 0, page: 1, pageSize: 20 } }),
    ),
  )
  await user.click(screen.getByRole("button", { name: "Retry" }))
  expect(await screen.findByText("No data")).toBeInTheDocument()
})

test("collapsing search retains its draft without prematurely applying it", async () => {
  const { user, queries } = await setup()
  renderAdmin(<UserManagementPage />)
  await row("Alice")
  await user.type(screen.getByRole("textbox", { name: "Keyword" }), "Alice")
  await user.click(screen.getByRole("button", { name: "Toggle user search" }))
  await waitFor(() => expect(screen.queryByRole("textbox", { name: "Keyword" })).not.toBeInTheDocument())
  await user.click(screen.getByRole("button", { name: "Toggle user search" }))
  expect(await screen.findByRole("textbox", { name: "Keyword" })).toHaveValue("Alice")
  expect(queries.at(-1)?.searchParams.get("keyword")).toBeNull()
})

test("submitting unchanged filters and returning to an earlier filter both read fresh directory data despite the app's five-minute cache default", async () => {
  const { user, state, queries } = await setup()
  const client = createTestQueryClient()
  client.setDefaultOptions({ queries: { retry: false, staleTime: 300_000 }, mutations: { retry: false } })
  server.use(
    http.get(`${base}/users`, ({ request }) => {
      const url = new URL(request.url),
        keyword = url.searchParams.get("keyword") || ""
      queries.push(url)
      const records = state.records.filter((record) =>
        `${record.name} ${record.username}`.toLowerCase().includes(keyword),
      )
      return HttpResponse.json({ code: 0, data: { records, total: records.length, page: 1, pageSize: 20 } })
    }),
  )
  render(
    <QueryClientProvider client={client}>
      <UserManagementPage />
    </QueryClientProvider>,
  )
  await row("Alice")
  state.records[0] = { ...alice, name: "Alice Remote One" }
  await user.click(screen.getByRole("button", { name: "Search" }))
  await row("Alice Remote One")
  const keyword = screen.getByRole("textbox", { name: "Keyword" })
  await user.type(keyword, "alice")
  await user.click(screen.getByRole("button", { name: "Search" }))
  await waitFor(() => expect(queries.at(-1)?.searchParams.get("keyword")).toBe("alice"))
  await row("Alice Remote One")
  await user.clear(keyword)
  await user.type(keyword, "bob")
  await user.click(screen.getByRole("button", { name: "Search" }))
  await row("Bob")
  state.records[0] = { ...alice, name: "Alice Remote Two" }
  await user.clear(keyword)
  await user.type(keyword, "alice")
  await user.click(screen.getByRole("button", { name: "Search" }))
  await row("Alice Remote Two")
  expect(queries.filter((url) => url.searchParams.get("keyword") === "alice")).toHaveLength(2)
})
