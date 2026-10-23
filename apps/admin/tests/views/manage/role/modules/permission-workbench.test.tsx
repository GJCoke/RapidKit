// @vitest-environment jsdom
import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClientProvider, onlineManager, type QueryClient } from "@tanstack/react-query"
import { createMemoryRouter, RouterProvider } from "react-router"
import { afterEach, beforeEach, expect, test } from "vitest"
import { http, HttpResponse } from "msw"
import { server } from "@test/setup/server"
import { createTestQueryClient } from "@test/setup/render"
import { getAuthSession } from "@/services/auth-session"
import { menu } from "./fixtures"
import { useAuthStore } from "@/stores/auth"
import i18n from "@/locales"
import { PermissionWorkbench } from "@/views/manage/role/modules/permission-workbench"

const base = "http://localhost:16000/api/v1"
const catalog = {
  resources: [
    {
      key: "user",
      label: "Users",
      dataScopes: [{ key: "self", label: "Self" }],
      fieldGroups: [{ key: "contact", label: "Contact", fields: ["email"], modes: ["masked", "hidden"] }],
    },
  ],
  codes: [
    { code: "user:read", resource: "user", label: "Read users", source: "code", depends: [], abacAction: "read" },
    {
      code: "user:update",
      resource: "user",
      label: "Update users",
      source: "code",
      depends: ["user:read"],
      abacAction: "write",
    },
  ],
}
let saved: unknown
function mount(seed?: (client: QueryClient) => void) {
  const client = createTestQueryClient()
  seed?.(client)
  const router = createMemoryRouter([
    { path: "/", element: <PermissionWorkbench roleId="r1" roleName="Reader" onClose={() => {}} /> },
    { path: "/other", element: <p>Other page</p> },
  ])
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}
beforeEach(async () => {
  saved = undefined
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
    http.get(`${base}/permission-catalog`, () => HttpResponse.json({ code: 0, data: catalog })),
    http.get(`${base}/roles/r1/permissions`, () =>
      HttpResponse.json({
        code: 0,
        data: { permissionCodes: [], dataScopes: {}, fieldModes: {}, invalidCodes: [], invalidScopes: [] },
      }),
    ),
    http.get(`${base}/permission-packages/all`, () =>
      HttpResponse.json({
        code: 0,
        data: [
          {
            key: "user.full",
            label: "User full",
            description: "",
            codes: ["user:update"],
            dataScopes: { user: "self" },
            fieldModes: { user: { contact: "hidden" } },
          },
        ],
      }),
    ),
    http.get(`${base}/manage/menus`, () =>
      HttpResponse.json({ code: 0, data: { records: [], total: 0, page: 1, pageSize: 500 } }),
    ),
    http.put(`${base}/roles/r1/permissions`, async ({ request }) => {
      saved = await request.json()
      return HttpResponse.json({ code: 0, data: true })
    }),
  )
})
afterEach(() => useAuthStore.getState().clearAuth())
test("package shortcuts select operations only, dependencies are explained, and saving requires review", async () => {
  const user = userEvent.setup()
  mount()
  await user.click(await screen.findByRole("checkbox", { name: "User full" }))
  expect(screen.getByRole("checkbox", { name: "Read users" })).toHaveAttribute("aria-disabled", "true")
  expect(screen.getByRole("checkbox", { name: "Read users" })).toBeChecked()
  expect(saved).toBeUndefined()
  await user.click(screen.getByRole("button", { name: "Review and save" }))
  expect(await screen.findByText("Pending permission changes")).toBeInTheDocument()
  await user.click(screen.getByRole("button", { name: "Save permissions" }))
  await waitFor(() => expect(saved).toEqual({ permissionCodes: ["user:update"], dataScopes: {}, fieldModes: {} }))
})
test("failed required data locks the workbench until retry succeeds", async () => {
  let fail = true
  server.use(
    http.get(`${base}/permission-packages/all`, () =>
      fail ? HttpResponse.json({ code: 500, message: "Failed", data: null }) : HttpResponse.json({ code: 0, data: [] }),
    ),
  )
  const user = userEvent.setup()
  mount()
  expect(await screen.findByText("Unable to load permissions; editing and saving are disabled")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Review and save" })).toBeDisabled()
  fail = false
  await user.click(screen.getByRole("button", { name: "Reload" }))
  expect(await screen.findByRole("checkbox", { name: "Update users" })).toBeEnabled()
})
test("invalid grants require explicit repair and menu failure retains resource editing", async () => {
  server.use(
    http.get(`${base}/manage/menus`, () => HttpResponse.json({ code: 500, message: "No menu access", data: null })),
    http.get(`${base}/roles/r1/permissions`, () =>
      HttpResponse.json({
        code: 0,
        data: {
          permissionCodes: ["legacy:read"],
          invalidCodes: ["legacy:read"],
          dataScopes: { user: "self" },
          fieldModes: {},
          invalidScopes: [{ resource: "user", group: null, stored: "region", effective: "self" }],
        },
      }),
    ),
  )
  const user = userEvent.setup()
  mount()
  expect(await screen.findByText(/Menu structure could not be loaded/)).toBeInTheDocument()
  await user.click(screen.getByRole("button", { name: "Remove invalid codes from draft" }))
  expect(screen.getByRole("button", { name: "Review and save" })).toBeDisabled()
  await user.click(screen.getByRole("button", { name: "Use effective values in draft" }))
  await user.click(screen.getByRole("button", { name: "Review and save" }))
  await user.click(screen.getByRole("button", { name: "Save permissions" }))
  await waitFor(() => expect(saved).toEqual({ permissionCodes: [], dataScopes: { user: "self" }, fieldModes: {} }))
})
test("dirty drafts block route changes and unload, and can be discarded explicitly", async () => {
  const user = userEvent.setup()
  const router = mount()
  await user.click(await screen.findByRole("checkbox", { name: "Update users" }))
  await user.click(screen.getByRole("button", { name: "Cancel" }))
  await screen.findByRole("alertdialog")
  await user.click(screen.getByRole("button", { name: "Keep editing" }))
  expect(screen.getByRole("checkbox", { name: "Update users" })).toBeChecked()
  const event = new Event("beforeunload", { cancelable: true })
  window.dispatchEvent(event)
  expect(event.defaultPrevented).toBe(true)
  act(() => {
    void router.navigate("/other")
  })
  await screen.findByRole("alertdialog")
  await user.click(screen.getByRole("button", { name: "Keep editing" }))
  expect(router.state.location.pathname).toBe("/")
  act(() => {
    void router.navigate("/other")
  })
  await user.click(await screen.findByRole("button", { name: "Discard draft" }))
  await screen.findByText("Other page")
})

test("server-flagged codes that still exist in the catalog cannot be silently saved", async () => {
  server.use(
    http.get(`${base}/roles/r1/permissions`, () =>
      HttpResponse.json({
        code: 0,
        data: {
          permissionCodes: ["user:read"],
          invalidCodes: ["user:read"],
          dataScopes: {},
          fieldModes: {},
          invalidScopes: [],
        },
      }),
    ),
  )
  const user = userEvent.setup()
  mount()
  await screen.findByRole("checkbox", { name: "Update users" })
  expect(screen.getByText("Remove invalid permission codes explicitly before saving")).toBeInTheDocument()
  await user.click(screen.getByRole("button", { name: "Remove invalid codes from draft" }))
  await user.click(screen.getByRole("button", { name: "Review and save" }))
  await user.click(screen.getByRole("button", { name: "Save permissions" }))
  await waitFor(() => expect(saved).toEqual({ permissionCodes: [], dataScopes: {}, fieldModes: {} }))
})

test("resource restrictions enable with operations, appear in review and persist explicitly", async () => {
  const user = userEvent.setup()
  mount()
  const scope = await screen.findByRole("combobox", { name: "Users / Data scope" })
  expect(scope).toBeDisabled()
  await user.click(screen.getByRole("checkbox", { name: "Update users" }))
  await user.click(scope)
  await user.click(await screen.findByRole("option", { name: "Self" }))
  await user.click(screen.getByRole("combobox", { name: "Users / Contact" }))
  await user.click(await screen.findByRole("option", { name: "Masked" }))
  await user.click(screen.getByRole("button", { name: "Review and save" }))
  expect(screen.getByText("Users: All → Self")).toBeInTheDocument()
  expect(screen.getByText("Users / Contact: Visible → Masked")).toBeInTheDocument()
  await user.click(screen.getByRole("button", { name: "Save permissions" }))
  await waitFor(() =>
    expect(saved).toEqual({
      permissionCodes: ["user:update"],
      dataScopes: { user: "self" },
      fieldModes: { user: { contact: "masked" } },
    }),
  )
})

test("reopening never exposes a cached draft when fresh grants fail to load", async () => {
  server.use(
    http.get(`${base}/roles/r1/permissions`, () =>
      HttpResponse.json({ code: 500, message: "Unavailable", data: null }),
    ),
  )
  mount((client) =>
    client.setQueryData(["role-grant", getAuthSession(), "r1"], {
      catalog,
      packages: [],
      permissions: { permissionCodes: [], invalidCodes: [], dataScopes: {}, fieldModes: {}, invalidScopes: [] },
      baseline: { permissionCodes: [], dataScopes: {}, fieldModes: {} },
    }),
  )
  expect(await screen.findByText("Unable to load permissions; editing and saving are disabled")).toBeInTheDocument()
  expect(screen.queryByRole("checkbox", { name: "Update users" })).not.toBeInTheDocument()
})

test("menu grouping reads every root page before presenting module ownership", async () => {
  const pages: number[] = []
  server.use(
    http.get(`${base}/manage/menus`, ({ request }) => {
      const page = Number(new URL(request.url).searchParams.get("page"))
      pages.push(page)
      return HttpResponse.json({
        code: 0,
        data: {
          records: [
            menu(`root-${page}`, { menuName: page === 1 ? "First module" : "Second module", permission: "user:read" }),
          ],
          page,
          pageSize: 500,
          total: 2,
        },
      })
    }),
  )
  mount()
  await screen.findByRole("button", { name: /First module/ })
  expect(screen.getByRole("button", { name: /Second module/ })).toBeInTheDocument()
  expect(pages).toEqual([1, 2])
})

test("module bulk actions include operations hidden by search and keep semantic dirty state", async () => {
  const user = userEvent.setup()
  mount()
  await user.type(
    await screen.findByRole("textbox", { name: "Search modules, resources or permissions" }),
    "Update users",
  )
  expect(screen.queryByRole("checkbox", { name: "Read users" })).not.toBeInTheDocument()
  await user.click(screen.getByRole("button", { name: "Select all in module" }))
  expect(screen.getByText("2 direct grants · 0 dependencies")).toBeInTheDocument()
  await user.click(screen.getByRole("button", { name: "Read-only module" }))
  expect(screen.getByText("1 direct grants · 0 dependencies")).toBeInTheDocument()
  await user.click(screen.getByRole("button", { name: "Clear module" }))
  expect(screen.getByRole("button", { name: "Review and save" })).toBeDisabled()
})

test.each([false, true])(
  "background query resets preserve the dirty draft and unload guard (failure=%s)",
  async (fail) => {
    let client!: QueryClient
    const user = userEvent.setup()
    mount((value) => {
      client = value
    })
    await user.click(await screen.findByRole("checkbox", { name: "Update users" }))
    if (fail)
      server.use(
        http.get(`${base}/roles/r1/permissions`, () =>
          HttpResponse.json({ code: 500, message: "Unavailable", data: null }),
        ),
      )
    await act(() => client.resetQueries({ queryKey: ["role-grant", getAuthSession(), "r1"] }))
    expect(await screen.findByRole("checkbox", { name: "Update users" })).toBeChecked()
    expect(screen.getByRole("button", { name: "Review and save" })).toBeEnabled()
    const event = new Event("beforeunload", { cancelable: true })
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  },
)

test("reconnect refetch preserves the in-progress permission draft", async () => {
  let calls = 0
  server.use(
    http.get(`${base}/roles/r1/permissions`, () => {
      calls++
      return HttpResponse.json({
        code: 0,
        data: { permissionCodes: [], invalidCodes: [], dataScopes: {}, fieldModes: {}, invalidScopes: [] },
      })
    }),
  )
  const user = userEvent.setup()
  mount()
  await user.click(await screen.findByRole("checkbox", { name: "Update users" }))
  act(() => onlineManager.setOnline(false))
  act(() => onlineManager.setOnline(true))
  await waitFor(() => expect(calls).toBe(2))
  await waitFor(() => expect(screen.getByRole("checkbox", { name: "Update users" })).toBeChecked())
})

test("failed menu refresh ignores cached module ownership and retry keeps the draft", async () => {
  let fail = true
  server.use(
    http.get(`${base}/manage/menus`, () =>
      fail
        ? HttpResponse.json({ code: 500, message: "Unavailable", data: null })
        : HttpResponse.json({
            code: 0,
            data: {
              records: [menu("fresh", { menuName: "Fresh module", permission: "user:read" })],
              total: 1,
              page: 1,
              pageSize: 500,
            },
          }),
    ),
  )
  const user = userEvent.setup()
  mount((client) =>
    client.setQueryData(
      ["permission-menus", getAuthSession()],
      [menu("old", { menuName: "Old module", permission: "user:read" })],
    ),
  )
  await screen.findByText(/Menu structure could not be loaded/)
  expect(screen.queryByRole("button", { name: /Old module/ })).not.toBeInTheDocument()
  expect(screen.getByRole("navigation", { name: "Adjust by resource" })).toBeInTheDocument()
  await user.click(screen.getByRole("checkbox", { name: "Update users" }))
  fail = false
  await user.click(screen.getByRole("button", { name: "Retry menu grouping" }))
  await screen.findByRole("button", { name: /Fresh module/ })
  expect(screen.getByRole("checkbox", { name: "Update users" })).toBeChecked()
})
