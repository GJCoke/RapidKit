// @vitest-environment jsdom
import "@test/setup/layout"
import { useState } from "react"
import { act, cleanup, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, test, vi } from "vitest"
import { http, HttpResponse } from "msw"
import { server } from "@test/setup/server"
import { renderAdmin } from "@test/setup/render"
import { useAuthStore } from "@/stores/auth"
import i18n from "@/locales"
import type { DepartmentTreeNode } from "@/services/api/department"
import { DepartmentPanel } from "@/views/manage/user/modules/department-panel"
Object.defineProperty(Element.prototype, "getAnimations", { configurable: true, value: () => [] })
const base = "http://localhost:16000/api/v1"
function node(id: string, children: DepartmentTreeNode[] = []): DepartmentTreeNode {
  return {
    id,
    name: `Department ${id.toUpperCase()}`,
    code: id,
    sort: 0,
    status: "1",
    parentId: null,
    createTime: "",
    updateTime: "",
    children,
  }
}
function tree() {
  return [node("a", [node("b", [node("c", [node("d", [node("e", [node("f", [node("g")])])])])])])]
}
function Controlled({ selected, changed }: { selected: (id: string) => void; changed: () => void }) {
  const [id, setId] = useState("all")
  return (
    <DepartmentPanel
      selectedId={id}
      onSelect={(next) => {
        setId(next)
        selected(next)
      }}
      onChanged={changed}
    />
  )
}
async function setup() {
  await i18n.changeLanguage("en-US")
  useAuthStore.getState().setToken("access", "department-panel-ui")
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
  server.use(
    http.get(`${base}/departments/tree`, () => HttpResponse.json({ code: 0, data: tree() })),
    http.get(`${base}/users/department-counts`, () =>
      HttpResponse.json({ code: 0, data: { total: 9, unassigned: 2, departments: { a: 1, b: 2, g: 4 } } }),
    ),
    http.get(`${base}/users/all`, () => HttpResponse.json({ code: 0, data: [] })),
  )
  const selected = vi.fn(),
    changed = vi.fn()
  return { user: userEvent.setup(), selected, changed }
}
afterEach(() => {
  cleanup()
  useAuthStore.getState().clearAuth()
})
test("directory browsing preserves subtree counts, deep scopes, ancestor navigation and search-result locations", async () => {
  const context = await setup()
  renderAdmin(<Controlled {...context} />)
  await waitFor(() => expect(screen.getByLabelText("Members in Department A")).toHaveTextContent("7"))
  expect(screen.getByRole("button", { name: /^All users/ })).toHaveTextContent("9")
  expect(screen.getByRole("button", { name: /^Unassigned/ })).toHaveTextContent("2")
  await context.user.click(screen.getByRole("button", { name: "Select Department B" }))
  expect(context.selected).toHaveBeenLastCalledWith("b")
  await context.user.click(screen.getByRole("button", { name: "Expand Department C" }))
  await context.user.click(screen.getByRole("button", { name: "Enter Department D" }))
  expect(screen.getByRole("button", { name: "Complete department path" })).toBeInTheDocument()
  await context.user.click(screen.getByRole("button", { name: "Complete department path" }))
  expect(await screen.findByRole("menuitem", { name: "Department B" })).toBeInTheDocument()
  await context.user.click(await screen.findByRole("menuitem", { name: "Department B" }))
  await context.user.type(screen.getByRole("textbox", { name: "Search departments" }), "department g")
  await context.user.click(screen.getByRole("button", { name: "Locate Department G" }))
  expect(context.selected).toHaveBeenLastCalledWith("g")
  expect(screen.getByRole("textbox", { name: "Search departments" })).toHaveValue("")
  expect(screen.getByRole("button", { name: "Select Department G" })).toHaveAttribute("aria-pressed", "true")
  await context.user.click(screen.getByRole("button", { name: "Back" }))
  await context.user.click(screen.getByRole("button", { name: "All departments" }))
  expect(screen.getByRole("button", { name: "Back" })).toBeDisabled()
  await context.user.click(screen.getByRole("button", { name: /^Unassigned/ }))
  expect(context.selected).toHaveBeenLastCalledWith("unassigned")
})
test("root, child and edit operations open the correct form and delete remains guarded by confirmation", async () => {
  const context = await setup(),
    removed: string[] = []
  const directory = tree()
  server.use(
    http.get(`${base}/departments/tree`, () => HttpResponse.json({ code: 0, data: directory })),
    http.delete(`${base}/departments/g`, () => {
      removed.push("g")
      let parent = directory[0]
      for (let depth = 0; depth < 5; depth++) parent = parent.children[0]
      parent.children = []
      return HttpResponse.json({ code: 0, data: node("g") })
    }),
  )
  renderAdmin(<Controlled {...context} />)
  await screen.findByRole("button", { name: "Department A actions" })
  await context.user.click(screen.getByRole("button", { name: "Add root department" }))
  expect(screen.getByRole("dialog", { name: "Add department" })).toBeInTheDocument()
  expect(screen.getByRole("combobox", { name: "Parent department" })).toHaveTextContent("Root department")
  await context.user.click(screen.getByRole("button", { name: "Cancel" }))
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  await context.user.click(screen.getByRole("button", { name: "Department A actions" }))
  await context.user.click(await screen.findByRole("menuitem", { name: "Add child department" }))
  expect(screen.getByRole("combobox", { name: "Parent department" })).toHaveTextContent("Department A")
  await context.user.click(screen.getByRole("button", { name: "Cancel" }))
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  await context.user.click(screen.getByRole("button", { name: "Department A actions" }))
  await context.user.click(await screen.findByRole("menuitem", { name: "Edit department" }))
  expect(screen.getByRole("textbox", { name: "Department code" })).toHaveValue("a")
  await context.user.click(screen.getByRole("button", { name: "Cancel" }))
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  await context.user.click(screen.getByRole("button", { name: "Department A actions" }))
  await context.user.click(await screen.findByRole("menuitem", { name: "Delete" }))
  await context.user.click(screen.getByRole("button", { name: "Cancel" }))
  expect(removed).toEqual([])
  await context.user.type(screen.getByRole("textbox", { name: "Search departments" }), "department g")
  await context.user.click(screen.getByRole("button", { name: "Locate Department G" }))
  await context.user.click(screen.getByRole("button", { name: "Department G actions" }))
  await context.user.click(await screen.findByRole("menuitem", { name: "Delete" }))
  await context.user.click(screen.getByRole("button", { name: "Delete" }))
  await waitFor(() => expect(context.changed).toHaveBeenCalledTimes(1))
  expect(removed).toEqual(["g"])
  await waitFor(() => expect(context.selected).toHaveBeenLastCalledWith("all"))
})
test("initial loading and department errors can retry to an empty directory without hiding the root shortcuts", async () => {
  const context = await setup()
  let release!: () => void,
    attempt = 0
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  server.use(
    http.get(`${base}/departments/tree`, async () => {
      attempt++
      if (attempt === 1) {
        await pending
        return HttpResponse.json({ code: 40001, message: "unavailable", data: null })
      }
      return HttpResponse.json({ code: 0, data: [] })
    }),
  )
  renderAdmin(<Controlled {...context} />)
  try {
    expect(await screen.findByText("Loading...")).toBeInTheDocument()
  } finally {
    release()
  }
  await screen.findByText("Unable to load departments")
  expect(screen.getByRole("button", { name: /^All users/ })).toBeInTheDocument()
  await context.user.click(screen.getByRole("button", { name: "Retry" }))
  expect(await screen.findByText("No departments")).toBeInTheDocument()
  expect(attempt).toBe(2)
})
test("incomplete scoped counts remain unknown and revocation removes menus and any pending delete confirmation", async () => {
  const context = await setup()
  server.use(
    http.get(`${base}/users/department-counts`, () =>
      HttpResponse.json({ code: 0, data: { total: 4, unassigned: 0, departments: { invisible: 4 } } }),
    ),
  )
  renderAdmin(<Controlled {...context} />)
  await screen.findByRole("button", { name: "Department A actions" })
  expect(screen.getByLabelText("Members in Department A")).toHaveTextContent("—")
  await context.user.click(screen.getByRole("button", { name: "Department A actions" }))
  await context.user.click(await screen.findByRole("menuitem", { name: "Delete" }))
  expect(screen.getByRole("alertdialog")).toBeInTheDocument()
  act(() =>
    useAuthStore.setState({
      userInfo: { ...useAuthStore.getState().userInfo!, isAdmin: false, buttons: ["user:read", "department:read"] },
    }),
  )
  await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument())
  expect(screen.queryByRole("button", { name: "Add root department" })).not.toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "Department A actions" })).not.toBeInTheDocument()
})

test("delete errors stay inside the open confirmation, prevent duplicate pending submissions and allow a deliberate retry", async () => {
  const context = await setup()
  let attempts = 0,
    release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  server.use(
    http.delete(`${base}/departments/g`, async () => {
      attempts++
      if (attempts === 1) {
        await pending
        return HttpResponse.json({ code: 40001, message: "try again", data: null })
      }
      return HttpResponse.json({ code: 0, data: node("g") })
    }),
  )
  renderAdmin(<Controlled {...context} />)
  await screen.findByRole("button", { name: "Department A actions" })
  await context.user.type(screen.getByRole("textbox", { name: "Search departments" }), "department g")
  await context.user.click(screen.getByRole("button", { name: "Locate Department G" }))
  await context.user.click(screen.getByRole("button", { name: "Department G actions" }))
  await context.user.click(await screen.findByRole("menuitem", { name: "Delete" }))
  const dialog = screen.getByRole("alertdialog")
  await context.user.click(within(dialog).getByRole("button", { name: "Delete" }))
  try {
    await waitFor(() => expect(attempts).toBe(1))
    expect(within(dialog).getByRole("button", { name: "Processing…" })).toBeDisabled()
    await context.user.click(within(dialog).getByRole("button", { name: "Processing…" }))
    expect(attempts).toBe(1)
  } finally {
    release()
  }
  expect(await within(dialog).findByText(/Failed/)).toBeVisible()
  expect(context.changed).not.toHaveBeenCalled()
  await context.user.click(within(dialog).getByRole("button", { name: "Delete" }))
  await waitFor(() => expect(context.changed).toHaveBeenCalledTimes(1))
  expect(attempts).toBe(2)
})
