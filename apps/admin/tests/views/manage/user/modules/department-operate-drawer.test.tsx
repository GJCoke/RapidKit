// @vitest-environment jsdom
import "@test/setup/layout"
import { cleanup, screen, waitFor, act } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, test, vi } from "vitest"
import { http, HttpResponse } from "msw"
import { server } from "@test/setup/server"
import { renderAdmin } from "@test/setup/render"
import { useAuthStore } from "@/stores/auth"
import i18n from "@/locales"
import { DepartmentOperateDrawer } from "@/views/manage/user/modules/department-operate-drawer"
Object.defineProperty(Element.prototype, "getAnimations", { configurable: true, value: () => [] })
const base = "http://localhost:16000/api/v1"
const root = {
  id: "root",
  parentId: null,
  name: "Root",
  code: "root",
  status: "1" as const,
  sort: 0,
  createTime: "",
  updateTime: "",
  children: [],
}
async function setup() {
  await i18n.changeLanguage("en-US")
  useAuthStore.getState().setToken("access", "department-form-ui")
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
    http.get(`${base}/departments/tree`, () => HttpResponse.json({ code: 0, data: [root] })),
    http.get(`${base}/users/all`, () =>
      HttpResponse.json({ code: 0, data: [{ id: "leader", name: "Leader", username: "leader" }] }),
    ),
  )
  return { user: userEvent.setup(), onSuccess: vi.fn(), onOpenChange: vi.fn() }
}
afterEach(() => {
  cleanup()
  useAuthStore.getState().clearAuth()
})
test("a child department keeps its preselected parent, validates required inputs and submits its chosen leader and order", async () => {
  const context = await setup(),
    writes: unknown[] = []
  server.use(
    http.post(`${base}/departments`, async ({ request }) => {
      writes.push(await request.json())
      return HttpResponse.json({ code: 0, data: { ...root, id: "created" } })
    }),
  )
  renderAdmin(
    <DepartmentOperateDrawer open parentId="root" onSuccess={context.onSuccess} onOpenChange={context.onOpenChange} />,
  )
  await context.user.click(screen.getByRole("button", { name: "Save" }))
  expect(await screen.findByText("Enter a department name (up to 100 characters)")).toBeInTheDocument()
  expect(screen.getByText("Enter a department code (up to 50 characters)")).toBeInTheDocument()
  expect(writes).toEqual([])
  await context.user.type(screen.getByRole("textbox", { name: "Department name" }), "Research")
  await context.user.type(screen.getByRole("textbox", { name: "Department code" }), "research")
  await context.user.clear(screen.getByRole("spinbutton", { name: "Sort order" }))
  await context.user.type(screen.getByRole("spinbutton", { name: "Sort order" }), "4")
  await waitFor(() => expect(screen.getByRole("combobox", { name: "Parent department" })).toHaveTextContent("Root"))
  await context.user.click(screen.getByRole("combobox", { name: "Leader" }))
  await context.user.click(await screen.findByRole("option", { name: "Leader (leader)" }))
  await context.user.click(screen.getByRole("button", { name: "Save" }))
  await waitFor(() => expect(context.onSuccess).toHaveBeenCalledTimes(1))
  expect(writes).toEqual([
    { parentId: "root", name: "Research", code: "research", sort: 4, status: "1", leaderId: "leader" },
  ])
  expect(context.onOpenChange).toHaveBeenCalledWith(false)
})
test("a failed edit keeps pending status, unavailable leader identity and draft fields for an explicit retry", async () => {
  const context = await setup(),
    writes: unknown[] = []
  server.use(
    http.get(`${base}/users/all`, () => HttpResponse.json({ code: 40001, message: "options unavailable", data: null })),
    http.put(`${base}/departments/department`, async ({ request }) => {
      writes.push(await request.json())
      return HttpResponse.json(
        writes.length === 1 ? { code: 40001, message: "duplicate department", data: null } : { code: 0, data: root },
      )
    }),
  )
  const department = {
    ...root,
    id: "department",
    name: "Existing",
    code: "existing",
    status: "3" as const,
    leaderId: "unavailable-leader",
  }
  renderAdmin(
    <DepartmentOperateDrawer
      open
      department={department}
      onSuccess={context.onSuccess}
      onOpenChange={context.onOpenChange}
    />,
  )
  await screen.findByText("Unable to load user options")
  expect(screen.getByRole("combobox", { name: "Leader" })).toHaveTextContent("Current leader (unavailable-leader)")
  expect(screen.getByRole("combobox", { name: "Status" })).toHaveTextContent("Pending")
  await context.user.click(screen.getByRole("button", { name: "Save" }))
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Failed"))
  expect(screen.getByRole("textbox", { name: "Department name" })).toHaveValue("Existing")
  expect(context.onSuccess).not.toHaveBeenCalled()
  await context.user.click(screen.getByRole("button", { name: "Save" }))
  await waitFor(() => expect(context.onSuccess).toHaveBeenCalledTimes(1))
  expect(writes).toHaveLength(2)
  expect(writes[0]).toEqual(writes[1])
  expect(writes[1]).toMatchObject({ status: "3", leaderId: "unavailable-leader" })
})
test("revoking an open department operation closes it without exposing a retained save action", async () => {
  const context = await setup()
  renderAdmin(<DepartmentOperateDrawer open onSuccess={context.onSuccess} onOpenChange={context.onOpenChange} />)
  await screen.findByRole("textbox", { name: "Department name" })
  act(() =>
    useAuthStore.setState({
      userInfo: { ...useAuthStore.getState().userInfo!, isAdmin: false, buttons: ["department:read"] },
    }),
  )
  await waitFor(() => expect(context.onOpenChange).toHaveBeenCalledWith(false))
  expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument()
})

test("option failures still permit explicitly clearing a known parent and leader", async () => {
  const context = await setup(),
    writes: unknown[] = []
  server.use(
    http.get(`${base}/departments/tree`, () => HttpResponse.json({ code: 40001, message: "unavailable", data: null })),
    http.get(`${base}/users/all`, () => HttpResponse.json({ code: 40001, message: "unavailable", data: null })),
    http.put(`${base}/departments/department`, async ({ request }) => {
      writes.push(await request.json())
      return HttpResponse.json({ code: 0, data: root })
    }),
  )
  renderAdmin(
    <DepartmentOperateDrawer
      open
      department={{ ...root, id: "department", parentId: "parent", leaderId: "leader" }}
      onSuccess={context.onSuccess}
      onOpenChange={context.onOpenChange}
    />,
  )
  await screen.findByText("Unable to load department options")
  await screen.findByText("Unable to load user options")
  await context.user.click(screen.getByRole("combobox", { name: "Parent department" }))
  await context.user.click(await screen.findByRole("option", { name: "Root department" }))
  await context.user.click(screen.getByRole("combobox", { name: "Leader" }))
  await context.user.click(await screen.findByRole("option", { name: "No leader" }))
  await context.user.click(screen.getByRole("button", { name: "Save" }))
  await waitFor(() => expect(context.onSuccess).toHaveBeenCalledTimes(1))
  expect(writes[0]).toMatchObject({ parentId: null, leaderId: null })
})
test("closing a pending department editor prevents its response from closing a newly opened draft", async () => {
  const context = await setup()
  let release!: () => void,
    calls = 0
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  server.use(
    http.put(`${base}/departments/department`, async () => {
      calls++
      await pending
      return HttpResponse.json({ code: 0, data: root })
    }),
  )
  const view = renderAdmin(
    <DepartmentOperateDrawer
      open
      department={{ ...root, id: "department" }}
      onSuccess={context.onSuccess}
      onOpenChange={context.onOpenChange}
    />,
  )
  await context.user.click(screen.getByRole("button", { name: "Save" }))
  await waitFor(() => expect(calls).toBe(1))
  view.rerender(
    <DepartmentOperateDrawer open={false} onSuccess={context.onSuccess} onOpenChange={context.onOpenChange} />,
  )
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  view.rerender(<DepartmentOperateDrawer open onSuccess={context.onSuccess} onOpenChange={context.onOpenChange} />)
  await context.user.type(screen.getByRole("textbox", { name: "Department name" }), "New Draft")
  release()
  await waitFor(() => expect(view.queryClient.isMutating()).toBe(0))
  expect(screen.getByRole("textbox", { name: "Department name" })).toHaveValue("New Draft")
  expect(context.onSuccess).not.toHaveBeenCalled()
  expect(context.onOpenChange).not.toHaveBeenCalledWith(false)
})
