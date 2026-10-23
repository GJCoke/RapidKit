// @vitest-environment jsdom
import { act, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, expect, test } from "vitest"
import { http, HttpResponse } from "msw"
import { server } from "@test/setup/server"
import { renderAdmin } from "@test/setup/render"
import { useAuthStore } from "@/stores/auth"
import type { Menu } from "@/services/api/menu"
import i18n from "@/locales"
import MenuPage from "@/views/manage/menu"
const base = "http://localhost:16000/api/v1"
const parent: Menu = {
  id: "parent",
  menuName: "Parent",
  menuType: "1",
  routeName: "parent",
  routePath: "/parent",
  status: "1",
  order: 0,
  iconType: "1",
  createTime: "",
  updateTime: "",
  hideInMenu: false,
  keepAlive: false,
  constant: false,
  multiTab: false,
  query: [],
  component: "layout.base",
  children: [
    {
      id: "child",
      menuName: "Child",
      menuType: "2",
      routeName: "parent_child",
      routePath: "/parent/child/:id",
      component: "view.home",
      status: "3",
      order: 1,
      iconType: "1",
      createTime: "",
      updateTime: "",
      parentId: "parent",
      hideInMenu: true,
      keepAlive: true,
      constant: false,
      multiTab: false,
      query: [],
      permission: "user:read",
      activeMenu: "parent",
    },
  ],
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
    http.get(`${base}/manage/menus`, () =>
      HttpResponse.json({ code: 0, data: { records: [parent], page: 1, pageSize: 10, total: 1 } }),
    ),
    http.get(`${base}/manage/pages`, () => HttpResponse.json({ code: 0, data: ["home", "manage_user"] })),
    http.get(`${base}/permission-catalog`, () =>
      HttpResponse.json({
        code: 0,
        data: {
          resources: [{ key: "user", label: "Users" }],
          codes: [{ code: "user:read", resource: "user", label: "Read users" }],
        },
      }),
    ),
    http.get(`${base}/manage/menus/active-menu-options`, ({ request }) =>
      HttpResponse.json({
        code: 0,
        data: [
          {
            id: "parent",
            menuName: "Parent",
            routeName: new URL(request.url).searchParams.get("constant") === "true" ? "constant_parent" : "parent",
          },
        ],
      }),
    ),
  )
})
afterEach(() => useAuthStore.getState().clearAuth())
test("tree expansion exposes child actions; edit retains status, parameters and highlighting", async () => {
  const user = userEvent.setup()
  let body: unknown
  server.use(
    http.put(`${base}/manage/menus/child`, async ({ request }) => {
      body = await request.json()
      return HttpResponse.json({ code: 0, data: parent })
    }),
  )
  renderAdmin(<MenuPage />)
  expect(await screen.findByText("Parent")).toBeVisible()
  expect(screen.queryByText("Child")).not.toBeInTheDocument()
  await user.click(await screen.findByRole("button", { name: "Expand Parent" }))
  const row = (await screen.findByText("Child")).closest("tr")!
  await user.click(within(row).getByRole("button", { name: "Edit" }))
  expect(screen.getByRole("textbox", { name: "Path Param" })).toHaveValue("id")
  expect(screen.getByRole("combobox", { name: "Active Menu" })).toHaveTextContent("Parent")
  await user.click(screen.getByRole("button", { name: "Save" }))
  await waitFor(() =>
    expect(body).toMatchObject({
      status: "3",
      routePath: "/parent/child/:id",
      component: "view.home",
      activeMenu: "parent",
      permission: "user:read",
    }),
  )
  expect(body).not.toHaveProperty("children")
})
test("new page validates required fields and permission; directory hides permission", async () => {
  const user = userEvent.setup()
  renderAdmin(<MenuPage />)
  await user.click(screen.getByRole("button", { name: "Add Menu" }))
  await user.click(screen.getByRole("button", { name: "Save" }))
  expect(await screen.findAllByText("This field is required")).toHaveLength(3)
  await user.click(screen.getByRole("combobox", { name: "Type" }))
  await user.click(await screen.findByRole("option", { name: "Menu" }))
  expect(screen.getByRole("combobox", { name: "Permission Code" })).toBeVisible()
  await user.click(screen.getByRole("button", { name: "Save" }))
  expect(await screen.findByText("Please select the permission code required to open the page")).toBeVisible()
})
test("constant partition changes clear highlighting and query the new partition", async () => {
  const user = userEvent.setup()
  renderAdmin(<MenuPage />)
  await user.click(await screen.findByRole("button", { name: "Expand Parent" }))
  await user.click(within(screen.getByText("Child").closest("tr")!).getByRole("button", { name: "Edit" }))
  await waitFor(() => expect(screen.getByRole("combobox", { name: "Active Menu" })).toHaveTextContent("Parent"))
  await user.click(screen.getByRole("checkbox", { name: "Constant" }))
  expect(screen.queryByRole("combobox", { name: "Permission Code" })).not.toBeInTheDocument()
  await user.click(screen.getByRole("combobox", { name: "Active Menu" }))
  expect(await screen.findByRole("option", { name: "Parent (constant_parent)" })).toBeVisible()
  expect(screen.queryByRole("option", { name: "Parent (parent)" })).not.toBeInTheDocument()
})
test("read-only account has no mutation actions and revoked dialog stays closed", async () => {
  const user = userEvent.setup()
  renderAdmin(<MenuPage />)
  await user.click(screen.getByRole("button", { name: "Add Menu" }))
  act(() =>
    useAuthStore.setState({
      userInfo: { ...useAuthStore.getState().userInfo!, isAdmin: false, buttons: ["menu:read"] },
    }),
  )
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "Add Menu" })).not.toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument()
  act(() => useAuthStore.setState({ userInfo: { ...useAuthStore.getState().userInfo!, isAdmin: true } }))
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
})

test("child creation submits all metadata, cleans query entries and keeps the draft on server error", async () => {
  const user = userEvent.setup()
  let saved: unknown
  server.use(
    http.post(`${base}/manage/menus`, async ({ request }) => {
      saved = await request.json()
      return HttpResponse.json({ code: 400, message: "Duplicate route", data: null })
    }),
  )
  renderAdmin(<MenuPage />)
  await user.click(
    within((await screen.findByRole("button", { name: "Expand Parent" })).closest("tr")!).getByRole("button", {
      name: "Add Child Menu",
    }),
  )
  await user.type(screen.getByRole("textbox", { name: "Name" }), "Draft child")
  await user.type(screen.getByRole("textbox", { name: "Route Name" }), "parent_new")
  expect(screen.getByRole("textbox", { name: "Route Path" })).toHaveValue("/parent/new")
  expect(screen.getByRole("textbox", { name: "I18n Key" })).toHaveValue("route.parent_new")
  expect(screen.queryByRole("combobox", { name: "Layout Component" })).not.toBeInTheDocument()
  await user.type(screen.getByRole("textbox", { name: "Path Param" }), "id?")
  await user.click(screen.getByRole("checkbox", { name: "Keep Alive" }))
  await user.click(screen.getByRole("checkbox", { name: "Multi Tab" }))
  await user.click(screen.getByRole("button", { name: "Add query parameter" }))
  await user.type(screen.getByRole("textbox", { name: "Please enter route parameter Key 1" }), "tab")
  await user.type(screen.getByRole("textbox", { name: "Please enter route parameter Value 1" }), "profile")
  await user.click(screen.getByRole("button", { name: "Add query parameter" }))
  await user.click(screen.getByRole("button", { name: "Save" }))
  await waitFor(() =>
    expect(saved).toMatchObject({
      parentId: "parent",
      routeName: "parent_new",
      routePath: "/parent/new/:id?",
      keepAlive: true,
      multiTab: true,
      query: [{ key: "tab", value: "profile" }],
      permission: null,
    }),
  )
  expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("Draft child")
  expect(screen.getByRole("dialog")).toBeVisible()
})

test("single and batch deletion require confirmation and refresh the tree", async () => {
  const user = userEvent.setup()
  const removed: string[] = []
  server.use(
    http.delete(`${base}/manage/menus/child`, () => {
      removed.push("child")
      return HttpResponse.json({ code: 0, data: true })
    }),
    http.delete(`${base}/manage/menus`, async ({ request }) => {
      removed.push(...((await request.json()) as { ids: string[] }).ids)
      return HttpResponse.json({ code: 0, data: true })
    }),
  )
  renderAdmin(<MenuPage />)
  await user.click(await screen.findByRole("button", { name: "Expand Parent" }))
  await user.click(within(screen.getByText("Child").closest("tr")!).getByRole("button", { name: "Delete" }))
  expect(removed).toEqual([])
  await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Cancel" }))
  expect(removed).toEqual([])
  await user.click(screen.getByRole("checkbox", { name: "Select Parent" }))
  expect(screen.getByRole("checkbox", { name: "Select Child" })).toBeChecked()
  await user.click(screen.getByRole("button", { name: "Batch delete" }))
  await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete" }))
  await waitFor(() => expect(removed).toEqual(["parent", "child"]))
  await user.click(within(screen.getByText("Child").closest("tr")!).getByRole("button", { name: "Delete" }))
  await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete" }))
  await waitFor(() => expect(removed).toEqual(["parent", "child", "child"]))
})

test("changing partitions ignores a late old active-menu response", async () => {
  const user = userEvent.setup()
  let release: (() => void) | undefined
  const old = new Promise<void>((resolve) => {
    release = resolve
  })
  server.use(
    http.get(`${base}/manage/menus/active-menu-options`, async ({ request }) => {
      const constant = new URL(request.url).searchParams.get("constant") === "true"
      if (!constant) await old
      return HttpResponse.json({
        code: 0,
        data: [
          { id: "p", menuName: constant ? "New partition" : "Old partition", routeName: constant ? "new" : "old" },
        ],
      })
    }),
  )
  renderAdmin(<MenuPage />)
  await user.click(await screen.findByRole("button", { name: "Expand Parent" }))
  await user.click(within(screen.getByText("Child").closest("tr")!).getByRole("button", { name: "Edit" }))
  await user.click(screen.getByRole("checkbox", { name: "Constant" }))
  await user.click(screen.getByRole("combobox", { name: "Active Menu" }))
  expect(await screen.findByRole("option", { name: "New partition (new)" })).toBeVisible()
  await act(async () => {
    release!()
    await old
  })
  expect(screen.queryByRole("option", { name: "Old partition (old)" })).not.toBeInTheDocument()
})

test("selecting a collapsed parent includes descendants in the confirmed batch request", async () => {
  const user = userEvent.setup()
  let ids: string[] = []
  server.use(
    http.delete(`${base}/manage/menus`, async ({ request }) => {
      ids = ((await request.json()) as { ids: string[] }).ids
      return HttpResponse.json({ code: 0, data: true })
    }),
  )
  renderAdmin(<MenuPage />)
  await user.click(await screen.findByRole("checkbox", { name: "Select Parent" }))
  expect(screen.queryByText("Child")).not.toBeInTheDocument()
  await user.click(screen.getByRole("button", { name: "Batch delete" }))
  await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete" }))
  await waitFor(() => expect(ids).toEqual(["parent", "child"]))
})

test("pagination blocks stale rows and page selection until the new page arrives", async () => {
  const user = userEvent.setup()
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  server.use(
    http.get(`${base}/manage/menus`, async ({ request }) => {
      const page = Number(new URL(request.url).searchParams.get("page") ?? 1)
      if (page === 2) await gate
      return HttpResponse.json({
        code: 0,
        data: {
          records: [page === 1 ? parent : { ...parent, id: "next", menuName: "Next", routeName: "next", children: [] }],
          page,
          pageSize: 10,
          total: 20,
        },
      })
    }),
  )
  renderAdmin(<MenuPage />)
  await screen.findByRole("checkbox", { name: "Select Parent" })
  await user.click(screen.getByRole("button", { name: "Next" }))
  expect(screen.getByRole("checkbox", { name: "Select page" })).toHaveAttribute("aria-disabled", "true")
  expect(screen.queryByRole("checkbox", { name: "Select Parent" })).not.toBeInTheDocument()
  await user.click(screen.getByRole("checkbox", { name: "Select page" }))
  await act(async () => {
    release()
    await gate
  })
  await screen.findByRole("checkbox", { name: "Select Next" })
  expect(screen.getByRole("button", { name: "Batch delete" })).toBeDisabled()
})
