// @vitest-environment jsdom
import "@test/setup/layout"
import { act, cleanup, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, test, vi } from "vitest"
import { http, HttpResponse } from "msw"
import { z } from "zod"
import { server } from "@test/setup/server"
import { renderAdmin } from "@test/setup/render"
import { useAuthStore } from "@/stores/auth"
import type { User } from "@/services/api/user"
import i18n from "@/locales"
import { UserOperateDrawer } from "@/views/manage/user/modules/user-operate-drawer"
Object.defineProperty(Element.prototype, "getAnimations", { configurable: true, value: () => [] })
const base = "http://localhost:16000/api/v1"
const record: User = {
  id: "u1",
  name: "Existing User",
  username: "existinguser",
  email: "secret@example.test",
  phone: "123456",
  avatar: "avatar.png",
  nickname: "Nick",
  gender: "other",
  status: "3",
  roles: ["UNLISTED"],
  isAdmin: false,
  departmentId: "unavailable-department",
  remark: "private remark",
  createTime: "",
  updateTime: "",
}
async function setup() {
  await i18n.changeLanguage("en-US")
  useAuthStore.getState().setToken("access", "user-form-ui")
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
    http.get(`${base}/roles/all`, () =>
      HttpResponse.json({ code: 0, data: [{ id: "reader", name: "Reader", code: "READER" }] }),
    ),
    http.get(`${base}/departments/tree`, () =>
      HttpResponse.json({
        code: 0,
        data: [
          {
            id: "department",
            name: "Research",
            code: "research",
            parentId: null,
            sort: 0,
            status: "1",
            createTime: "",
            updateTime: "",
            children: [],
          },
        ],
      }),
    ),
    http.post(`${base}/users/validate-username-pinyin`, async ({ request }) => {
      const body = z.object({ name: z.string(), username: z.string() }).parse(await request.json())
      const suggestedUsername = body.name.toLowerCase().replaceAll(" ", "")
      return HttpResponse.json({
        code: 0,
        data: { suggestedUsername, consistent: body.username === suggestedUsername },
      })
    }),
  )
  return { user: userEvent.setup(), onSuccess: vi.fn(), onOpenChange: vi.fn() }
}
afterEach(() => {
  cleanup()
  useAuthStore.getState().clearAuth()
})
test("new users show invitation guidance, autofill untouched pinyin and preserve the selected department and roles without a password field", async () => {
  const context = await setup(),
    writes: unknown[] = []
  server.use(
    http.post(`${base}/users`, async ({ request }) => {
      writes.push(await request.json())
      return HttpResponse.json({ code: 0, data: { ...record, status: "3" } })
    }),
  )
  renderAdmin(
    <UserOperateDrawer
      open
      departmentId="department"
      onSuccess={context.onSuccess}
      onOpenChange={context.onOpenChange}
    />,
  )
  expect(screen.getByText("An invitation lets the user set their own password.")).toBeInTheDocument()
  expect(screen.queryByLabelText(/Password/)).not.toBeInTheDocument()
  await context.user.type(screen.getByRole("textbox", { name: "Name" }), "Parity User")
  await waitFor(() => expect(screen.getByRole("textbox", { name: "Username" })).toHaveValue("parityuser"))
  await context.user.type(screen.getByRole("textbox", { name: "Email" }), "parity@example.test")
  await context.user.click(await screen.findByRole("checkbox", { name: "Reader" }))
  expect(screen.getByRole("combobox", { name: "Department" })).toHaveTextContent("Research")
  await context.user.click(screen.getByRole("button", { name: "Save" }))
  await waitFor(() => expect(context.onSuccess).toHaveBeenCalledTimes(1))
  expect(writes).toEqual([
    {
      name: "Parity User",
      username: "parityuser",
      email: "parity@example.test",
      phone: null,
      avatar: null,
      nickname: null,
      gender: null,
      status: "1",
      roles: ["READER"],
      isAdmin: false,
      departmentId: "department",
      remark: null,
    },
  ])
})
test("new field restrictions immediately hide clear text, omit protected values, retain unknown role and department selections and hide the administrator control", async () => {
  const context = await setup(),
    writes: unknown[] = []
  server.use(
    http.get(`${base}/roles/all`, () => HttpResponse.json({ code: 40001, message: "roles unavailable", data: null })),
    http.put(`${base}/users/u1`, async ({ request }) => {
      writes.push(await request.json())
      return HttpResponse.json({ code: 0, data: record })
    }),
  )
  renderAdmin(
    <UserOperateDrawer open user={record} onSuccess={context.onSuccess} onOpenChange={context.onOpenChange} />,
  )
  expect(screen.getByRole("textbox", { name: "Email" })).toHaveValue("secret@example.test")
  act(() =>
    useAuthStore.setState({
      userInfo: {
        ...useAuthStore.getState().userInfo!,
        isAdmin: false,
        buttons: ["user:update", "user:validate-name", "role:options", "department:read"],
        restrictedFields: { user: { email: "masked", phone: "hidden", remark: "hidden" } },
      },
    }),
  )
  for (const label of ["Email", "Phone", "Remark"]) {
    expect(screen.getByRole("textbox", { name: label })).toBeDisabled()
    expect(screen.getByRole("textbox", { name: label })).toHaveValue("")
  }
  expect(screen.queryByRole("checkbox", { name: "Administrator" })).not.toBeInTheDocument()
  await screen.findByText("Unable to load role options")
  expect(screen.getByText("UNLISTED", { exact: true })).toBeInTheDocument()
  expect(screen.getByRole("combobox", { name: "Department" })).toHaveTextContent(
    "Current department (unavailable-department)",
  )
  await context.user.click(screen.getByRole("button", { name: "Save" }))
  await waitFor(() => expect(context.onSuccess).toHaveBeenCalledTimes(1))
  expect(writes).toHaveLength(1)
  expect(writes[0]).toEqual({
    name: "Existing User",
    username: "existinguser",
    avatar: "avatar.png",
    nickname: "Nick",
    gender: "other",
    status: "3",
    roles: ["UNLISTED"],
    departmentId: "unavailable-department",
  })
})
test("a mismatched username requires a fresh confirmation, returning to edit preserves input and focuses username before an explicit override", async () => {
  const context = await setup(),
    writes: unknown[] = []
  server.use(
    http.put(`${base}/users/u1`, async ({ request }) => {
      writes.push(await request.json())
      return HttpResponse.json({ code: 0, data: record })
    }),
  )
  renderAdmin(
    <UserOperateDrawer
      open
      user={{ ...record, username: "customuser" }}
      onSuccess={context.onSuccess}
      onOpenChange={context.onOpenChange}
    />,
  )
  await context.user.click(screen.getByRole("button", { name: "Save" }))
  let dialog = await screen.findByRole("alertdialog", { name: "Check username" })
  expect(dialog).toHaveTextContent("existinguser")
  expect(writes).toEqual([])
  await context.user.click(within(dialog).getByRole("button", { name: "Return to edit" }))
  await waitFor(() => expect(screen.getByRole("textbox", { name: "Username" })).toHaveFocus())
  expect(screen.getByRole("textbox", { name: "Username" })).toHaveValue("customuser")
  await context.user.click(screen.getByRole("button", { name: "Save" }))
  dialog = await screen.findByRole("alertdialog", { name: "Check username" })
  await context.user.click(within(dialog).getByRole("button", { name: "Submit anyway" }))
  await waitFor(() => expect(context.onSuccess).toHaveBeenCalledTimes(1))
  expect(writes[0]).toMatchObject({ username: "customuser" })
})
test("validation failure also requires explicit confirmation and a failed save preserves the draft for retry", async () => {
  const context = await setup(),
    writes: unknown[] = []
  server.use(
    http.post(`${base}/users/validate-username-pinyin`, () =>
      HttpResponse.json({ code: 40001, message: "validation unavailable", data: null }),
    ),
    http.put(`${base}/users/u1`, async ({ request }) => {
      writes.push(await request.json())
      return HttpResponse.json(
        writes.length === 1 ? { code: 40001, message: "duplicate", data: null } : { code: 0, data: record },
      )
    }),
  )
  renderAdmin(
    <UserOperateDrawer open user={record} onSuccess={context.onSuccess} onOpenChange={context.onOpenChange} />,
  )
  await context.user.click(screen.getByRole("button", { name: "Save" }))
  let dialog = await screen.findByRole("alertdialog", { name: "Unable to verify username" })
  await context.user.click(within(dialog).getByRole("button", { name: "Return to edit" }))
  expect(writes).toEqual([])
  await context.user.click(screen.getByRole("button", { name: "Save" }))
  dialog = await screen.findByRole("alertdialog", { name: "Unable to verify username" })
  await context.user.click(within(dialog).getByRole("button", { name: "Submit anyway" }))
  expect(await screen.findByText("Failed", { exact: true })).toBeInTheDocument()
  expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue(record.name)
  expect(context.onSuccess).not.toHaveBeenCalled()
  await context.user.click(screen.getByRole("button", { name: "Save" }))
  dialog = await screen.findByRole("alertdialog", { name: "Unable to verify username" })
  await context.user.click(within(dialog).getByRole("button", { name: "Submit anyway" }))
  await waitFor(() => expect(context.onSuccess).toHaveBeenCalledTimes(1))
  expect(writes).toHaveLength(2)
  expect(writes[0]).toEqual(writes[1])
})

test("an old pending editor cannot close or complete a newly opened draft after its response arrives", async () => {
  const context = await setup()
  let release!: () => void,
    calls = 0
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  server.use(
    http.put(`${base}/users/u1`, async () => {
      calls++
      await pending
      return HttpResponse.json({ code: 0, data: record })
    }),
  )
  const view = renderAdmin(
    <UserOperateDrawer open user={record} onSuccess={context.onSuccess} onOpenChange={context.onOpenChange} />,
  )
  await context.user.click(screen.getByRole("button", { name: "Save" }))
  await waitFor(() => expect(calls).toBe(1))
  view.rerender(
    <UserOperateDrawer open={false} user={record} onSuccess={context.onSuccess} onOpenChange={context.onOpenChange} />,
  )
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  view.rerender(<UserOperateDrawer open onSuccess={context.onSuccess} onOpenChange={context.onOpenChange} />)
  const name = document.getElementById("user-name")
  if (!name) throw new Error("The new editor must contain its own name field")
  await context.user.type(name, "New Draft")
  release()
  await waitFor(() => expect(view.queryClient.isMutating()).toBe(0))
  expect(name).toHaveValue("New Draft")
  expect(context.onSuccess).not.toHaveBeenCalled()
  expect(context.onOpenChange).not.toHaveBeenCalledWith(false)
})
