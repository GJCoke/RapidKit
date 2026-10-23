// @vitest-environment jsdom
import { act, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, expect, test } from "vitest"
import { http, HttpResponse } from "msw"
import { server } from "@test/setup/server"
import { renderAdmin } from "@test/setup/render"
import { useAppStore } from "@/stores/app"
import { useAuthStore } from "@/stores/auth"
import i18n from "@/locales"
import RolePage from "@/views/manage/role"

const base = "http://localhost:16000/api/v1"
const role = {
  id: "r1",
  name: "Reader",
  code: "reader",
  description: "Read only",
  status: "1",
  permissionCodes: ["user:read"],
  dataScopes: { user: "self" },
  fieldModes: {},
  createTime: "",
  updateTime: "",
}
beforeEach(async () => {
  await i18n.changeLanguage("en-US")
  useAuthStore.getState().setToken("access", "refresh")
  useAuthStore.setState({
    userInfo: {
      id: "admin",
      name: "Admin",
      username: "admin",
      email: "",
      createTime: "",
      updateTime: "",
      roles: [],
      buttons: [],
      isAdmin: true,
    },
  })
  server.use(
    http.get(`${base}/roles`, () =>
      HttpResponse.json({ code: 0, data: { records: [role], page: 1, pageSize: 10, total: 1 } }),
    ),
  )
})
afterEach(() => useAuthStore.getState().clearAuth())
test("validates required fields and edits only role metadata without overwriting grants", async () => {
  const user = userEvent.setup()
  let body: unknown
  server.use(
    http.put(`${base}/roles/r1`, async ({ request }) => {
      body = await request.json()
      return HttpResponse.json({ code: 0, data: role })
    }),
  )
  renderAdmin(<RolePage />)
  await user.click(screen.getByRole("button", { name: "Add role" }))
  await user.click(screen.getByRole("button", { name: "Save" }))
  expect(await screen.findAllByText("This field is required")).toHaveLength(2)
  await user.click(screen.getByRole("button", { name: "Cancel" }))
  await user.click(await screen.findByRole("button", { name: "Edit" }))
  await user.clear(screen.getByRole("textbox", { name: "Name" }))
  await user.type(screen.getByRole("textbox", { name: "Name" }), "Updated")
  await user.click(screen.getByRole("button", { name: "Save" }))
  await waitFor(() => expect(body).toEqual({ name: "Updated", code: "reader", description: "Read only", status: "1" }))
})
test("search resets pagination and deletion confirms explicit selected IDs", async () => {
  const user = userEvent.setup()
  const queries: string[] = []
  let removed = ""
  server.use(
    http.get(`${base}/roles`, ({ request }) => {
      queries.push(new URL(request.url).searchParams.get("keyword") ?? "")
      return HttpResponse.json({ code: 0, data: { records: [role], page: 1, pageSize: 10, total: 1 } })
    }),
    http.delete(`${base}/roles/r1`, () => {
      removed = "r1"
      return HttpResponse.json({ code: 0, data: true })
    }),
  )
  renderAdmin(<RolePage />)
  await user.type(screen.getByRole("textbox", { name: "Keyword" }), "Read")
  await user.click(screen.getByRole("button", { name: "Search" }))
  await waitFor(() => expect(queries).toContain("Read"))
  await user.click(await screen.findByRole("checkbox", { name: "Select Reader" }))
  await user.click(screen.getByRole("button", { name: "Batch delete" }))
  const dialog = await screen.findByRole("alertdialog")
  expect(removed).toBe("")
  await user.click(within(dialog).getByRole("button", { name: "Delete" }))
  await waitFor(() => expect(removed).toBe("r1"))
})
test("read-only users never see mutation controls and revocation closes an open editor", async () => {
  const user = userEvent.setup()
  renderAdmin(<RolePage />)
  await user.click(await screen.findByRole("button", { name: "Edit" }))
  act(() =>
    useAuthStore.setState({
      userInfo: { ...useAuthStore.getState().userInfo!, isAdmin: false, buttons: ["role:read"] },
    }),
  )
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  expect(screen.queryByRole("button", { name: "Add role" })).not.toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "Permissions" })).not.toBeInTheDocument()
  expect(screen.queryByRole("columnheader", { name: "Actions" })).not.toBeInTheDocument()
  act(() => useAuthStore.setState({ userInfo: { ...useAuthStore.getState().userInfo!, isAdmin: true } }))
  await waitFor(() => expect(screen.getByRole("button", { name: "Add role" })).toBeInTheDocument())
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
})

test("list failures retry and empty filters render the empty state", async () => {
  const user = userEvent.setup()
  let fail = true
  server.use(
    http.get(`${base}/roles`, () =>
      HttpResponse.json(
        fail
          ? { code: 500, message: "Unavailable", data: null }
          : { code: 0, data: { records: [], page: 1, pageSize: 10, total: 0 } },
      ),
    ),
  )
  renderAdmin(<RolePage />)
  expect(await screen.findByText("Failed to load data")).toBeInTheDocument()
  fail = false
  await user.click(screen.getByRole("button", { name: "Retry" }))
  expect(await screen.findByText("No data")).toBeInTheDocument()
})

test("backend validation errors retain the entered role draft", async () => {
  const user = userEvent.setup()
  let attempts = 0
  server.use(
    http.post(`${base}/roles`, () => {
      attempts++
      return HttpResponse.json({ code: 400, message: "Duplicate code", data: null })
    }),
  )
  renderAdmin(<RolePage />)
  await user.click(screen.getByRole("button", { name: "Add role" }))
  await user.type(screen.getByRole("textbox", { name: "Name" }), "Reader")
  await user.type(screen.getByRole("textbox", { name: "Code" }), "reader")
  await user.click(screen.getByRole("button", { name: "Save" }))
  await waitFor(() => expect(attempts).toBe(1))
  expect(screen.getByRole("textbox", { name: "Code" })).toHaveValue("reader")
  expect(screen.getByRole("dialog")).toBeInTheDocument()
})

test("pending deletion disables repeated row and batch deletion", async () => {
  const user = userEvent.setup()
  let finish: () => void = () => {}
  server.use(
    http.delete(`${base}/roles/r1`, async () => {
      await new Promise<void>((resolve) => {
        finish = resolve
      })
      return HttpResponse.json({ code: 0, data: true })
    }),
  )
  renderAdmin(<RolePage />)
  await user.click(await screen.findByRole("checkbox", { name: "Select Reader" }))
  await user.click(screen.getByRole("button", { name: "Batch delete" }))
  await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete" }))
  try {
    await waitFor(() => expect(screen.getByRole("button", { name: "Batch delete" })).toBeDisabled())
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled()
  } finally {
    await act(async () => {
      finish()
    })
  }
})

test("narrow screens keep columns scrollable without overlapping pinned actions", async () => {
  useAppStore.setState({ isMobile: true })
  try {
    renderAdmin(<RolePage />)
    await screen.findByRole("cell", { name: "reader" })
    expect(screen.getByRole("columnheader", { name: "Name" }).style.position).not.toBe("sticky")
    expect(screen.getByRole("columnheader", { name: "Actions" }).style.position).not.toBe("sticky")
  } finally {
    useAppStore.setState({ isMobile: false })
  }
})

test("editing metadata preserves an existing backend status outside the enable/disable picker", async () => {
  const user = userEvent.setup()
  const legacy = { ...role, status: "3" }
  let saved: unknown
  server.use(
    http.get(`${base}/roles`, () =>
      HttpResponse.json({ code: 0, data: { records: [legacy], page: 1, pageSize: 10, total: 1 } }),
    ),
    http.put(`${base}/roles/r1`, async ({ request }) => {
      saved = await request.json()
      return HttpResponse.json({ code: 0, data: legacy })
    }),
  )
  renderAdmin(<RolePage />)
  await user.click(await screen.findByRole("button", { name: "Edit" }))
  await user.clear(screen.getByRole("textbox", { name: "Description" }))
  await user.type(screen.getByRole("textbox", { name: "Description" }), "Updated description")
  await user.click(screen.getByRole("button", { name: "Save" }))
  await waitFor(() =>
    expect(saved).toEqual({ name: "Reader", code: "reader", description: "Updated description", status: "3" }),
  )
})
