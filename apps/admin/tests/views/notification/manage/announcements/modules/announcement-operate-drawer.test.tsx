// @vitest-environment jsdom
import "@test/setup/layout"
import { useState } from "react"
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, test, vi } from "vitest"
import { z } from "zod"
import { http, HttpResponse } from "msw"
import { server } from "@test/setup/server"
import { renderAdmin } from "@test/setup/render"
import { normalizeRoutes } from "@/features/router/route-model"
import { useRouteStore } from "@/stores/route"
import { useAuthStore } from "@/stores/auth"
import i18n from "@/locales"
import { AnnouncementOperateDrawer } from "@/views/notification/manage/announcements/modules/announcement-operate-drawer"
const base = "http://localhost:16000/api/v1/admin/notifications"
function Editor({ messageId }: { messageId?: string }) {
  const [closed, setClosed] = useState(false)
  return closed ? (
    <p>Editor closed</p>
  ) : (
    <AnnouncementOperateDrawer messageId={messageId} onClose={() => setClosed(true)} />
  )
}
async function setup(messageId?: string) {
  await i18n.changeLanguage("en-US")
  useAuthStore.getState().setToken("access", "announcement-editor-refresh")
  useAuthStore.setState({
    userInfo: {
      id: "admin",
      username: "admin",
      name: "Admin",
      email: "",
      createTime: "",
      updateTime: "",
      isAdmin: true,
      roles: [],
      buttons: [],
    },
  })
  const view = renderAdmin(<Editor messageId={messageId} />)
  return { ...view, user: userEvent.setup() }
}
afterEach(() => {
  useAuthStore.getState().clearAuth()
  useRouteStore.getState().clearRoutes()
})
async function fill(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByRole("textbox", { name: "Title" }), "Maintenance")
  await user.type(screen.getByRole("textbox", { name: "Body" }), "Full announcement body")
}
test("draft validation and backend failures preserve entered content for retry without publishing", async () => {
  const bodies: unknown[] = []
  let failed = true
  server.use(
    http.post(base, async ({ request }) => {
      bodies.push(await request.json())
      return HttpResponse.json(
        failed ? { code: 500, message: "Failed", data: null } : { code: 0, data: { messageId: "draft" } },
      )
    }),
  )
  const { user } = await setup()
  await user.click(screen.getByRole("button", { name: "Save draft" }))
  await screen.findByText("Enter an announcement title.")
  expect(bodies).toEqual([])
  await fill(user)
  await user.click(screen.getByRole("button", { name: "Save draft" }))
  await screen.findByText("Saving failed. Your inputs are preserved; please retry.")
  expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue("Maintenance")
  failed = false
  await user.click(screen.getByRole("button", { name: "Save draft" }))
  await screen.findByText("Draft saved · Not published")
  expect(bodies).toHaveLength(2)
  expect(bodies[1]).toMatchObject({
    saveAsDraft: true,
    rawTitle: "Maintenance",
    rawContent: "Full announcement body",
    audience: [{ type: "all", includeDescendants: false }],
  })
})
test("immediate publication retries the saved draft rather than creating another announcement", async () => {
  const calls: string[] = []
  let failed = true
  server.use(
    http.post(base, () => {
      calls.push("create")
      return HttpResponse.json({ code: 0, data: { messageId: "draft" } })
    }),
    http.put(`${base}/draft`, () => {
      calls.push("update")
      return HttpResponse.json({ code: 0, data: { id: "draft" } })
    }),
    http.post(`${base}/draft/publish`, () => {
      calls.push("publish")
      return HttpResponse.json(
        failed ? { code: 500, message: "Failed", data: null } : { code: 0, data: { recipientCount: 2 } },
      )
    }),
  )
  const { user } = await setup()
  await fill(user)
  await user.click(screen.getByRole("button", { name: "Publish" }))
  const confirmation = await screen.findByRole("dialog", { name: "Review before publishing" })
  await user.click(within(confirmation).getByRole("button", { name: "Publish" }))
  await within(confirmation).findByText("Publishing failed. The draft is preserved; you can retry.")
  expect(calls).toEqual(["create", "publish"])
  failed = false
  await user.click(within(confirmation).getByRole("button", { name: "Publish" }))
  await screen.findByText("Editor closed")
  expect(calls).toEqual(["create", "publish", "update", "publish"])
})
test("an account replacement during creation prevents the old editor from continuing to publish", async () => {
  let release!: () => void,
    started = false,
    publishes = 0
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  server.use(
    http.post(base, async () => {
      started = true
      await gate
      return HttpResponse.json({ code: 0, data: { messageId: "old-draft" } })
    }),
    http.post(`${base}/old-draft/publish`, () => {
      publishes++
      return HttpResponse.json({ code: 0, data: { recipientCount: 1 } })
    }),
  )
  const { user, queryClient } = await setup()
  await fill(user)
  try {
    await user.click(screen.getByRole("button", { name: "Publish" }))
    const confirmation = await screen.findByRole("dialog", { name: "Review before publishing" })
    await user.click(within(confirmation).getByRole("button", { name: "Publish" }))
    await waitFor(() => expect(started).toBe(true))
    act(() => useAuthStore.getState().setToken("other-access", "other-refresh"))
    await screen.findByText("Editor closed")
    act(() => release())
    await waitFor(() => expect(queryClient.isMutating()).toBe(0))
    expect(publishes).toBe(0)
  } finally {
    release()
  }
})

test("template search waits for a complete keyword instead of requesting each keystroke", async () => {
  const keywords: string[] = []
  server.use(
    http.get("http://localhost:16000/api/v1/admin/notification-templates", ({ request }) => {
      keywords.push(new URL(request.url).searchParams.get("keyword") ?? "")
      return HttpResponse.json({ code: 0, data: { records: [], page: 1, pageSize: 100, total: 0 } })
    }),
  )
  const { user } = await setup()
  await user.click(screen.getByRole("combobox", { name: "Content source" }))
  await user.click(await screen.findByRole("option", { name: "Use a template" }))
  await waitFor(() => expect(keywords).toEqual([""]))
  await user.click(screen.getByRole("combobox", { name: "Notification template" }))
  const popover = await screen.findByRole("dialog", { name: "Notification template" })
  await user.type(within(popover).getByRole("combobox"), "welcome")
  await waitFor(() => expect(keywords.at(-1)).toBe("welcome"))
  expect(keywords).toEqual(["", "welcome"])
})

test("a banner conflict preserves the form, refreshes its revision, and reuses the same publication request ID", async () => {
  let checks = 0
  const bodies: Record<string, unknown>[] = []
  server.use(
    http.post(`${base}/banner-check`, () =>
      HttpResponse.json({
        code: 0,
        data: {
          revision: ++checks,
          serverNow: "2026-10-23T08:00:00Z",
          current: {
            id: "current",
            title: "Current banner",
            content: "Body",
            contentMode: "raw",
            level: "warning",
            status: "published",
          },
          scheduled: null,
        },
      }),
    ),
    http.post(base, async ({ request }) => {
      bodies.push(z.record(z.unknown()).parse(await request.json()))
      return HttpResponse.json(
        bodies.length === 1
          ? { code: 92099, message: "Conflict", data: null }
          : { code: 0, data: { messageId: "banner" } },
      )
    }),
  )
  const { user } = await setup()
  await user.click(screen.getByRole("combobox", { name: "Display mode" }))
  await user.click(await screen.findByRole("option", { name: "Top announcement" }))
  await fill(user)
  await user.click(screen.getByRole("button", { name: "Publish" }))
  const first = await screen.findByRole("dialog", { name: "Review before publishing" })
  await user.click(within(first).getByRole("button", { name: "Replace and display" }))
  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: "Review before publishing" })).not.toBeInTheDocument(),
  )
  await screen.findByText(
    "Publication failed; another administrator may have changed announcements. Your form is retained. Review the status and confirm again.",
  )
  expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue("Maintenance")
  await waitFor(() => expect(checks).toBe(2))
  await user.click(screen.getByRole("button", { name: "Publish" }))
  const second = await screen.findByRole("dialog", { name: "Review before publishing" })
  await user.click(within(second).getByRole("button", { name: "Replace and display" }))
  await screen.findByText("Editor closed")
  expect(bodies).toHaveLength(2)
  expect(bodies[0]).toMatchObject({
    displayMode: "top_banner",
    bannerRevision: 1,
    replaceCurrent: true,
    replaceScheduled: false,
    channels: [],
    mandatory: false,
    saveAsDraft: false,
  })
  expect(bodies[1]).toMatchObject({ bannerRevision: 3, clientRequestId: bodies[0]!.clientRequestId })
  expect(bodies[0]!.clientRequestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
})

test("scheduling an inbox announcement persists the UTC plan without an immediate publish call", async () => {
  let body: Record<string, unknown> | null = null
  server.use(
    http.post(base, async ({ request }) => {
      body = z.record(z.unknown()).parse(await request.json())
      return HttpResponse.json({ code: 0, data: { messageId: "plan" } })
    }),
  )
  const { user } = await setup()
  await fill(user)
  await user.click(screen.getByRole("radio", { name: "Schedule" }))
  fireEvent.change(screen.getByLabelText("Scheduled publication time"), { target: { value: "2030-10-23T15:00" } })
  await user.click(screen.getByRole("button", { name: "Confirm schedule" }))
  const confirmation = await screen.findByRole("dialog", { name: "Review before publishing" })
  await user.click(within(confirmation).getByRole("button", { name: "Confirm schedule" }))
  await screen.findByText("Editor closed")
  expect(body).toMatchObject({
    displayMode: "inbox",
    saveAsDraft: false,
    publishAt: new Date("2030-10-23T15:00").toISOString().slice(0, 19),
  })
})

test("localized editing detects shared parameters, validates complete language pairs and saves the portable envelope", async () => {
  let body: Record<string, unknown> | null = null
  server.use(
    http.post(base, async ({ request }) => {
      body = z.record(z.unknown()).parse(await request.json())
      return HttpResponse.json({ code: 0, data: { messageId: "local-draft" } })
    }),
  )
  const { user } = await setup()
  await user.click(screen.getByRole("combobox", { name: "Content source" }))
  await user.click(await screen.findByRole("option", { name: "Localized content" }))
  await user.click(screen.getByRole("textbox", { name: "zh-CN title" }))
  await user.paste("通知 {system}")
  await user.type(screen.getByRole("textbox", { name: "zh-CN body" }), "正文")
  await user.type(await screen.findByRole("textbox", { name: "Value to send: system" }), "RapidKit")
  await screen.findByText("通知 RapidKit")
  await user.click(screen.getByRole("tab", { name: /^English/ }))
  await user.type(screen.getByRole("textbox", { name: "en-US title" }), "Maintenance")
  await user.click(screen.getByRole("button", { name: "Save draft" }))
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Complete both fields for en-US"))
  expect(body).toBeNull()
  await user.click(screen.getByRole("textbox", { name: "en-US body" }))
  await user.paste("Body {system}")
  await user.click(screen.getByRole("button", { name: "Save draft" }))
  await screen.findByText("Draft saved · Not published")
  expect(body).toMatchObject({
    localizedContent: {
      defaultLocale: "zh-CN",
      translations: {
        "zh-CN": { title: "通知 {system}", content: "正文" },
        "en-US": { title: "Maintenance", content: "Body {system}" },
      },
      parameters: { system: "RapidKit" },
    },
  })
})

test("recipient variables and audience previews remain read-only and mark older content previews stale", async () => {
  const contentBodies: unknown[] = []
  let creates = 0
  server.use(
    http.get("http://localhost:16000/api/v1/admin/notification-templates", () =>
      HttpResponse.json({
        code: 0,
        data: {
          records: [
            {
              id: "template",
              code: "welcome",
              name: "Welcome",
              category: "user.invited",
              level: "info",
              contentMode: "raw",
              titleTemplate: "Hello {name}",
              contentTemplate: "Welcome",
              variableSchema: { name: { type: "string", required: true, example: "EXAMPLE" } },
              defaultChannels: ["in_app"],
              mandatory: false,
              enabled: true,
              version: 1,
              createTime: "",
              updateTime: "",
            },
          ],
          page: 1,
          pageSize: 100,
          total: 1,
        },
      }),
    ),
    http.get("http://localhost:16000/api/v1/users/all", () =>
      HttpResponse.json({ code: 0, data: [{ id: "reader", name: "Reader", username: "reader" }] }),
    ),
    http.post(`${base}/content-preview`, async ({ request }) => {
      contentBodies.push(await request.json())
      return HttpResponse.json({
        code: 0,
        data: { contentMode: "raw", title: "Hello Reader", content: "Personalized body", contentParams: null },
      })
    }),
    http.post(`${base}/audience-preview`, () => HttpResponse.json({ code: 0, data: { total: 2, byType: { all: 2 } } })),
    http.post(base, () => {
      creates++
      return HttpResponse.json({ code: 0, data: { messageId: "draft" } })
    }),
  )
  const { user } = await setup()
  await user.click(screen.getByRole("combobox", { name: "Content source" }))
  await user.click(await screen.findByRole("option", { name: "Use a template" }))
  await user.click(screen.getByRole("combobox", { name: "Notification template" }))
  const picker = await screen.findByRole("dialog", { name: "Notification template" })
  await user.click(await within(picker).findByRole("option", { name: "Welcome · welcome" }))
  expect(screen.getByRole("textbox", { name: "Value to send: name" })).toHaveValue("")
  await user.click(screen.getByRole("combobox", { name: "Value source for name" }))
  await user.click(await screen.findByRole("option", { name: "Recipient name" }))
  await user.click(screen.getByRole("combobox", { name: "Preview recipient" }))
  const recipient = await screen.findByRole("dialog", { name: "Preview recipient" })
  await user.click(await within(recipient).findByRole("option", { name: "Reader · reader" }))
  await user.click(screen.getByRole("button", { name: "Preview content" }))
  await screen.findByText("Hello Reader")
  expect(contentBodies).toEqual([
    {
      templateCode: "welcome",
      templateVariables: {},
      variableBindings: { name: { source: "recipient", field: "name" } },
      audience: [{ type: "all", includeDescendants: false }],
      previewUserId: "reader",
    },
  ])
  await user.click(screen.getByRole("button", { name: "Estimate recipients" }))
  await screen.findByText("2 users in this scope")
  await user.click(screen.getByRole("radio", { name: /^Selected recipients/ }))
  await screen.findByText("Not checked")
  await screen.findByText(
    "The audience has changed. This is the previous preview. Preview again to check that the user is in the new audience.",
  )
  expect(creates).toBe(0)
})

test("menu action parameters apply defaults, validate required fields and invalidate verification after edits", async () => {
  const bodies: unknown[] = []
  server.use(
    http.get(`${base}/action-targets`, () =>
      HttpResponse.json({
        code: 0,
        data: [
          {
            menuId: "destination",
            label: "Member detail",
            breadcrumb: ["Management", "Member detail"],
            route: "manage_user",
            path: "/manage/user/:id",
            parameters: [
              {
                name: "id",
                location: "path",
                required: true,
                defaultValue: null,
                example: "reader",
                descriptionKey: null,
              },
              {
                name: "view",
                location: "query",
                required: false,
                defaultValue: "summary",
                example: null,
                descriptionKey: null,
              },
            ],
          },
        ],
      }),
    ),
    http.post(`${base}/action-preview`, async ({ request }) => {
      bodies.push(await request.json())
      return HttpResponse.json({
        code: 0,
        data: {
          type: "menu",
          menuId: "destination",
          route: "manage_user",
          path: "/manage/user/reader",
          params: { id: "reader" },
          query: { view: "summary" },
        },
      })
    }),
  )
  const open = vi.spyOn(window, "open").mockReturnValue(null)
  const { user } = await setup()
  useRouteStore.setState({
    snapshot: normalizeRoutes([{ name: "manage_user", path: "/manage/user/:id", component: "view.manage_user" }]),
  })
  try {
    await user.click(screen.getByRole("combobox", { name: "Action type" }))
    await user.click(await screen.findByRole("option", { name: "System menu" }))
    await user.click(screen.getByRole("combobox", { name: "System menu" }))
    const picker = await screen.findByRole("dialog", { name: "System menu" })
    await user.click(await within(picker).findByRole("option", { name: "Member detail" }))
    expect(screen.getByRole("textbox", { name: "Query parameter view" })).toHaveValue("summary")
    await user.click(screen.getByRole("button", { name: "Validate target" }))
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("id"))
    expect(bodies).toEqual([])
    await user.type(screen.getByRole("textbox", { name: "Path parameter id" }), "reader")
    await user.click(screen.getByRole("button", { name: "Validate target" }))
    await screen.findByText("Target validated")
    expect(bodies).toEqual([
      {
        type: "menu",
        menuId: "destination",
        label: "Member detail",
        params: { id: "reader" },
        query: { view: "summary" },
      },
    ])
    await user.click(screen.getByRole("button", { name: "Open page to verify" }))
    expect(open).toHaveBeenCalledWith("/manage/user/reader?view=summary", "_blank", "noopener,noreferrer")
    await user.type(screen.getByRole("textbox", { name: "Path parameter id" }), "2")
    expect(screen.getByRole("button", { name: "Open page to verify" })).toBeDisabled()
    expect(screen.queryByText("Target validated")).not.toBeInTheDocument()
  } finally {
    open.mockRestore()
  }
})

test("unsafe external actions are rejected before preview requests", async () => {
  let calls = 0
  server.use(
    http.post(`${base}/action-preview`, () => {
      calls++
      return HttpResponse.json({ code: 0, data: {} })
    }),
  )
  const { user } = await setup()
  await user.click(screen.getByRole("combobox", { name: "Action type" }))
  await user.click(await screen.findByRole("option", { name: "External link" }))
  await user.type(screen.getByRole("textbox", { name: "External URL" }), "https://user:password@example.test")
  await user.click(screen.getByRole("button", { name: "Validate target" }))
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Enter a valid HTTP or HTTPS address without a username or password.",
    ),
  )
  expect(calls).toBe(0)
})

test("an unavailable recipient directory permits exact role codes and saves the selected scope union", async () => {
  let body: unknown
  server.use(
    http.get("http://localhost:16000/api/v1/roles/all", () =>
      HttpResponse.json({ code: 500, message: "Failed", data: null }),
    ),
    http.get("http://localhost:16000/api/v1/users/all", () =>
      HttpResponse.json({ code: 0, data: [{ id: "reader", name: "Reader", username: "reader" }] }),
    ),
    http.post(base, async ({ request }) => {
      body = await request.json()
      return HttpResponse.json({ code: 0, data: { messageId: "draft" } })
    }),
  )
  const { user } = await setup()
  await fill(user)
  await user.click(screen.getByRole("radio", { name: /^Selected recipients/ }))
  await user.click(screen.getByRole("combobox", { name: "Recipient scope type 1" }))
  await user.click(await screen.findByRole("option", { name: "Role" }))
  await user.type(await screen.findByRole("textbox", { name: "Recipient selection 1" }), "EXACT_ROLE_CODE")
  await user.click(screen.getByRole("button", { name: "Add recipients" }))
  await user.click(screen.getByRole("combobox", { name: "Recipient selection 2" }))
  const picker = await screen.findByRole("dialog", { name: "Recipient selection 2" })
  await user.click(await within(picker).findByRole("option", { name: "Reader · reader" }))
  await user.click(screen.getByRole("button", { name: "Save draft" }))
  await screen.findByText("Draft saved · Not published")
  expect(body).toMatchObject({
    audience: [
      { type: "role", value: "EXACT_ROLE_CODE", includeDescendants: false },
      { type: "user", value: "reader", includeDescendants: false },
    ],
  })
})

test("detail load failure locks editing until retry succeeds, then preserves the restored legacy action", async () => {
  let fail = true
  let body: unknown
  server.use(
    http.get(`${base}/legacy`, () =>
      HttpResponse.json(
        fail
          ? { code: 500, message: "Failed", data: null }
          : {
              code: 0,
              data: {
                id: "legacy",
                displayMode: "inbox",
                status: "draft",
                title: "Legacy title",
                content: "Legacy body",
                category: "admin.announcement",
                level: "info",
                contentMode: "raw",
                mandatory: false,
                channels: ["in_app"],
                audiences: [{ type: "all", includeDescendants: false }],
                action: { route: "manage_user", params: { id: "reader" }, label: "Open user" },
              },
            },
      ),
    ),
    http.put(`${base}/legacy`, async ({ request }) => {
      body = await request.json()
      return HttpResponse.json({ code: 0, data: { id: "legacy" } })
    }),
  )
  const { user } = await setup("legacy")
  await screen.findByText("The announcement could not be loaded. Reload before editing.")
  expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled()
  expect(screen.queryByRole("textbox", { name: "Title" })).not.toBeInTheDocument()
  fail = false
  await user.click(screen.getByRole("button", { name: "Retry" }))
  expect(await screen.findByRole("textbox", { name: "Title" })).toHaveValue("Legacy title")
  expect(screen.getByRole("textbox", { name: "Route name" })).toHaveValue("manage_user")
  await user.click(screen.getByRole("button", { name: "Save draft" }))
  await screen.findByText("Draft saved · Not published")
  expect(body).toMatchObject({ action: { route: "manage_user", params: { id: "reader" }, label: "Open user" } })
})

test("reopening a template announcement waits for fresh schema before restoring all saved variable values", async () => {
  let second = false,
    started = false,
    release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  server.use(
    http.get(`${base}/template-draft`, () =>
      HttpResponse.json({
        code: 0,
        data: {
          id: "template-draft",
          displayMode: "inbox",
          status: "draft",
          title: "Hello",
          content: "Body",
          category: "admin.announcement",
          level: "info",
          contentMode: "raw",
          mandatory: false,
          channels: ["in_app"],
          audiences: [{ type: "all", includeDescendants: false }],
          templateCode: "welcome",
          contentParams: { name: "Saved name", department: "Saved department" },
        },
      }),
    ),
    http.get("http://localhost:16000/api/v1/admin/notification-templates", async () => {
      if (second) {
        started = true
        await gate
      }
      return HttpResponse.json({
        code: 0,
        data: {
          records: [
            {
              id: "template",
              code: "welcome",
              name: "Welcome",
              category: "admin.announcement",
              level: "info",
              contentMode: "raw",
              titleTemplate: "Hello {name}",
              contentTemplate: second ? "From {department}" : "Body",
              variableSchema: {
                name: { type: "string", required: true },
                ...(second ? { department: { type: "string", required: true } } : {}),
              },
              defaultChannels: ["in_app"],
              mandatory: false,
              enabled: true,
              version: second ? 2 : 1,
              createTime: "",
              updateTime: "",
            },
          ],
          page: 1,
          pageSize: 100,
          total: 1,
        },
      })
    }),
  )
  const { user, rerender } = await setup("template-draft")
  expect(await screen.findByRole("textbox", { name: "Value to send: name" })).toHaveValue("Saved name")
  await user.click(screen.getByRole("button", { name: "Cancel" }))
  await screen.findByText("Editor closed")
  second = true
  rerender(<Editor key="reopened" messageId="template-draft" />)
  try {
    await waitFor(() => expect(started).toBe(true))
    act(() => release())
    expect(await screen.findByRole("textbox", { name: "Value to send: department" })).toHaveValue("Saved department")
    expect(screen.getByRole("textbox", { name: "Value to send: name" })).toHaveValue("Saved name")
  } finally {
    release()
  }
})

for (const scenario of [
  { permission: "notification:preview", restore: false },
  { permission: "notification:preview", restore: true },
  { permission: "notification:publish", restore: false },
] as const)
  test(`late banner checks cannot open confirmation after ${scenario.permission} revocation (restore=${scenario.restore})`, async () => {
    let started = false,
      release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      http.post(`${base}/banner-check`, async () => {
        started = true
        await gate
        return HttpResponse.json({
          code: 0,
          data: {
            revision: 1,
            serverNow: "2026-10-23T08:00:00Z",
            current: {
              id: "secret",
              title: "Private current banner",
              content: "Private body",
              contentMode: "raw",
              level: "info",
              status: "published",
            },
            scheduled: null,
          },
        })
      }),
    )
    const { user } = await setup()
    await user.click(screen.getByRole("combobox", { name: "Display mode" }))
    await user.click(await screen.findByRole("option", { name: "Top announcement" }))
    await fill(user)
    const save = screen.getByRole("button", { name: "Save draft" })
    try {
      await user.click(screen.getByRole("button", { name: "Publish" }))
      await waitFor(() => expect(started).toBe(true))
      act(() =>
        useAuthStore.setState({
          userInfo: {
            ...useAuthStore.getState().userInfo!,
            isAdmin: false,
            buttons: [
              "notification:read",
              "notification:create",
              "notification:update",
              ...(scenario.permission === "notification:preview"
                ? ["notification:publish" as const]
                : ["notification:preview" as const]),
            ],
          },
        }),
      )
      if (scenario.restore)
        act(() => useAuthStore.setState({ userInfo: { ...useAuthStore.getState().userInfo!, isAdmin: true } }))
      act(() => release())
      await waitFor(() => expect(save).not.toBeDisabled())
      expect(screen.queryByRole("dialog", { name: "Review before publishing" })).not.toBeInTheDocument()
      expect(screen.queryByText("Private current banner")).not.toBeInTheDocument()
    } finally {
      release()
    }
  })

test("revoking banner preview clears an already reviewed confirmation without losing the form or reviving it later", async () => {
  server.use(
    http.post(`${base}/banner-check`, () =>
      HttpResponse.json({
        code: 0,
        data: {
          revision: 1,
          serverNow: "2026-10-23T08:00:00Z",
          current: {
            id: "secret",
            title: "Private current banner",
            content: "Private body",
            contentMode: "raw",
            level: "info",
            status: "published",
          },
          scheduled: null,
        },
      }),
    ),
  )
  const { user } = await setup()
  await user.click(screen.getByRole("combobox", { name: "Display mode" }))
  await user.click(await screen.findByRole("option", { name: "Top announcement" }))
  await fill(user)
  await user.click(screen.getByRole("button", { name: "Publish" }))
  await screen.findByRole("dialog", { name: "Review before publishing" })
  await screen.findByText("Private current banner")
  act(() =>
    useAuthStore.setState({
      userInfo: {
        ...useAuthStore.getState().userInfo!,
        isAdmin: false,
        buttons: ["notification:read", "notification:create", "notification:update", "notification:publish"],
      },
    }),
  )
  expect(screen.queryByText("Private current banner")).not.toBeInTheDocument()
  expect(screen.queryByRole("dialog", { name: "Review before publishing" })).not.toBeInTheDocument()
  expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue("Maintenance")
  act(() => useAuthStore.setState({ userInfo: { ...useAuthStore.getState().userInfo!, isAdmin: true } }))
  expect(screen.queryByText("Private current banner")).not.toBeInTheDocument()
  expect(screen.queryByRole("dialog", { name: "Review before publishing" })).not.toBeInTheDocument()
})
