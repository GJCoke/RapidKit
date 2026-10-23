// @vitest-environment jsdom
import type { ReactNode } from "react"
import { useForm } from "react-hook-form"
import { act, renderHook, waitFor } from "@testing-library/react"
import { QueryClientProvider } from "@tanstack/react-query"
import { afterEach, expect, test } from "vitest"
import { http, HttpResponse } from "msw"
import { server } from "@test/setup/server"
import { createTestQueryClient } from "@test/setup/render"
import { useAuthStore } from "@/stores/auth"
import { getAuthSession } from "@/services/auth-session"
import type { NotificationTemplate } from "@/services/api/notification-template"
import i18n from "@/locales"
import {
  emptyAnnouncementForm,
  templateVariables,
  type AnnouncementForm,
} from "@/views/notification/manage/announcements/modules/announcement-model"
import { useAnnouncementPreviews } from "@/views/notification/manage/announcements/modules/use-announcement-previews"
const base = "http://localhost:16000/api/v1/admin/notifications"
const template: NotificationTemplate = {
  id: "template",
  code: "welcome",
  name: "Welcome",
  category: "user.invited",
  level: "info",
  contentMode: "raw",
  titleTemplate: "Hello {name}",
  contentTemplate: "Body",
  variableSchema: { name: { type: "string", required: true } },
  defaultChannels: ["in_app"],
  mandatory: false,
  enabled: true,
  version: 1,
  createTime: "",
  updateTime: "",
}
async function setup() {
  await i18n.changeLanguage("en-US")
  useAuthStore.getState().setToken("access", "previews-refresh")
  useAuthStore.setState({
    userInfo: {
      id: "admin",
      name: "Admin",
      username: "admin",
      email: "",
      createTime: "",
      updateTime: "",
      isAdmin: true,
      roles: [],
      buttons: [],
    },
  })
  server.use(http.get("http://localhost:16000/api/v1/users/all", () => HttpResponse.json({ code: 0, data: [] })))
  const client = createTestQueryClient(),
    session = getAuthSession()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const defaults: AnnouncementForm = {
    ...emptyAnnouncementForm(),
    contentSource: "template",
    templateCode: "welcome",
    variables: templateVariables(template, {}, { name: { source: "recipient", field: "name" } }),
    previewUserId: "reader",
  }
  return renderHook(
    () => {
      const form = useForm<AnnouncementForm>({ defaultValues: defaults })
      const values = form.watch()
      return { form, previews: useAnnouncementPreviews(form, values, template, session, false) }
    },
    { wrapper },
  )
}
afterEach(() => useAuthStore.getState().clearAuth())
test("a late audience estimate cannot overwrite the newly edited scope", async () => {
  let release!: () => void,
    started = false
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  server.use(
    http.post(`${base}/audience-preview`, async () => {
      started = true
      await gate
      return HttpResponse.json({ code: 0, data: { total: 99 } })
    }),
  )
  const { result } = await setup()
  let pending!: Promise<void>
  try {
    act(() => {
      pending = result.current.previews.previewAudience()
    })
    await waitFor(() => expect(started).toBe(true))
    act(() => {
      result.current.form.setValue("audienceMode", "selected")
      result.current.form.setValue("audiences", [{ type: "user", value: "reader", includeDescendants: false }])
    })
    await act(async () => {
      release()
      await pending
    })
    expect(result.current.previews.audienceTotal).toBeNull()
  } finally {
    release()
  }
})
test("a late personalized content response cannot become the preview for another audience", async () => {
  let release!: () => void,
    started = false
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  server.use(
    http.post(`${base}/content-preview`, async () => {
      started = true
      await gate
      return HttpResponse.json({
        code: 0,
        data: { contentMode: "raw", title: "Old audience secret", content: "Old body" },
      })
    }),
  )
  const { result } = await setup()
  let pending!: Promise<void>
  try {
    act(() => {
      pending = result.current.previews.previewContent()
    })
    await waitFor(() => expect(started).toBe(true))
    act(() => {
      result.current.form.setValue("audienceMode", "selected")
      result.current.form.setValue("audiences", [{ type: "user", value: "other", includeDescendants: false }])
    })
    await act(async () => {
      release()
      await pending
    })
    expect(result.current.previews.contentData).toBeNull()
    expect(result.current.previews.contentLoading).toBe(false)
  } finally {
    release()
  }
})
test("retained preview callbacks recheck current permissions before requesting recipient data", async () => {
  let calls = 0
  server.use(
    http.post(`${base}/content-preview`, () => {
      calls++
      return HttpResponse.json({ code: 0, data: { contentMode: "raw", title: "Secret", content: "Body" } })
    }),
  )
  const { result } = await setup(),
    preview = result.current.previews.previewContent
  act(() =>
    useAuthStore.setState({
      userInfo: { ...useAuthStore.getState().userInfo!, isAdmin: false, buttons: ["notification:read"] },
    }),
  )
  await act(() => preview())
  expect(calls).toBe(0)
  expect(result.current.previews.contentData).toBeNull()
})
test("recipient validation errors identify the missing allowed public field", async () => {
  server.use(
    http.post(`${base}/content-preview`, () =>
      HttpResponse.json({
        code: 92012,
        message: "Missing",
        data: {
          variableErrors: [{ source: "recipient", reason: "required_value_missing", name: "person", field: "name" }],
        },
      }),
    ),
  )
  const { result } = await setup()
  await act(() => result.current.previews.previewContent())
  expect(result.current.previews.contentError).toContain("person（Recipient name）")
  expect(result.current.previews.contentData).toBeNull()
})

for (const permission of ["notification:preview", "user:options"] as const)
  test(`revoking ${permission} clears an existing personalized preview and does not resurrect it after restoration`, async () => {
    server.use(
      http.post(`${base}/content-preview`, () =>
        HttpResponse.json({
          code: 0,
          data: { contentMode: "raw", title: "Private recipient name", content: "Private recipient email" },
        }),
      ),
    )
    const { result } = await setup()
    await act(() => result.current.previews.previewContent())
    expect(result.current.previews.contentData?.title).toBe("Private recipient name")
    act(() =>
      useAuthStore.setState({
        userInfo: {
          ...useAuthStore.getState().userInfo!,
          isAdmin: false,
          buttons: [
            "notification:read",
            "notification:update",
            ...(permission === "notification:preview" ? ["user:options" as const] : ["notification:preview" as const]),
          ],
        },
      }),
    )
    expect(result.current.previews.contentData).toBeNull()
    act(() => useAuthStore.setState({ userInfo: { ...useAuthStore.getState().userInfo!, isAdmin: true } }))
    expect(result.current.previews.contentData).toBeNull()
  })
