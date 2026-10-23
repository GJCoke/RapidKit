// @vitest-environment jsdom
import "@test/setup/layout"
import { useState } from "react"
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, test } from "vitest"
import { http, HttpResponse } from "msw"
import { server } from "@test/setup/server"
import { renderAdmin } from "@test/setup/render"
import { useAuthStore } from "@/stores/auth"
import i18n from "@/locales"
import type { NotificationTemplate } from "@/services/api/notification-template"
import { TemplateOperateDrawer } from "@/views/notification/manage/templates/modules/template-operate-drawer"
const base = "http://localhost:16000/api/v1/admin/notification-templates"
export const saved: NotificationTemplate = {
  id: "template",
  name: "Welcome",
  code: "welcome",
  category: "user.invited",
  level: "info",
  contentMode: "raw",
  titleTemplate: "Hello {name}",
  contentTemplate: "Body",
  contentFormat: "markdown",
  variableSchema: { name: { type: "string", required: true, example: "Ada", default: "Reader", description: "Keep" } },
  defaultChannels: ["in_app"],
  defaultAction: null,
  mandatory: false,
  enabled: true,
  version: 1,
  createTime: "",
  updateTime: "",
}
function Editor({ template }: { template: NotificationTemplate | null }) {
  const [closed, setClosed] = useState(false)
  return closed ? <p>Editor closed</p> : <TemplateOperateDrawer template={template} onClose={() => setClosed(true)} />
}
async function setup(template: NotificationTemplate | null = null) {
  await i18n.changeLanguage("en-US")
  useAuthStore.getState().setToken("access", "template-editor-refresh")
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
  return { ...renderAdmin(<Editor template={template} />), user: userEvent.setup() }
}
afterEach(() => useAuthStore.getState().clearAuth())
async function fill(user: ReturnType<typeof userEvent.setup>) {
  for (const [label, value] of [
    ["Template name", "New welcome"],
    ["Template code", "new.welcome"],
    ["Notification category", "user.invited"],
    ["Title template", "Welcome"],
    ["Body template", "Full body"],
  ])
    await user.type(screen.getByLabelText(label, { exact: true }), value)
}
test("required validation and failed creation keep all entries for retry without sending notifications", async () => {
  const bodies: unknown[] = []
  let fail = true
  server.use(
    http.post(base, async ({ request }) => {
      bodies.push(await request.json())
      return HttpResponse.json(fail ? { code: 500, message: "Failed", data: null } : { code: 0, data: saved })
    }),
  )
  const { user } = await setup()
  await user.click(screen.getByRole("button", { name: "Create template" }))
  await screen.findByText("Check the required fields marked above.")
  expect(bodies).toEqual([])
  await fill(user)
  await user.click(screen.getByRole("button", { name: "Create template" }))
  await screen.findByText("Could not save. Check your configuration and try again. Your entries have been kept.")
  expect(screen.getByRole("textbox", { name: "Template name" })).toHaveValue("New welcome")
  fail = false
  await user.click(screen.getByRole("button", { name: "Create template" }))
  await screen.findByText("Editor closed")
  expect(bodies).toHaveLength(2)
  expect(bodies[1]).toMatchObject({
    code: "new.welcome",
    contentMode: "raw",
    defaultChannels: ["in_app"],
    contentFormat: "plain_text",
  })
})
test("editing locks code and mode, preserves unknown variable rules and the existing format", async () => {
  let body: unknown
  server.use(
    http.put(`${base}/template`, async ({ request }) => {
      body = await request.json()
      return HttpResponse.json({ code: 0, data: saved })
    }),
  )
  const { user } = await setup(saved)
  expect(screen.getByRole("textbox", { name: "Template code" })).toBeDisabled()
  expect(screen.getByRole("combobox", { name: "Content mode" })).toBeDisabled()
  await user.click(screen.getByRole("button", { name: "Edit JSON" }))
  const json = screen.getByRole("textbox", { name: "Variable schema" })
  expect(JSON.parse((json as HTMLTextAreaElement).value)).toMatchObject({
    name: { default: "Reader", description: "Keep" },
  })
  await user.click(screen.getByRole("button", { name: "Edit table" }))
  await user.click(screen.getByRole("button", { name: "Save changes" }))
  await screen.findByText("Editor closed")
  expect(body).toMatchObject({
    contentFormat: "markdown",
    variableSchema: { name: { default: "Reader", description: "Keep", required: true, example: "Ada" } },
  })
  expect(body).not.toHaveProperty("code")
  expect(body).not.toHaveProperty("contentMode")
})
test("invalid JSON stays visible, prevents table conversion and never submits stale variables", async () => {
  let calls = 0
  server.use(
    http.put(`${base}/template`, () => {
      calls++
      return HttpResponse.json({ code: 0, data: saved })
    }),
  )
  const { user } = await setup(saved)
  await user.click(screen.getByRole("button", { name: "Edit JSON" }))
  const json = screen.getByRole("textbox", { name: "Variable schema" })
  fireEvent.change(json, { target: { value: "{" } })
  await user.click(screen.getByRole("button", { name: "Edit table" }))
  expect(json).toHaveValue("{")
  await user.click(screen.getByRole("button", { name: "Save changes" }))
  expect(calls).toBe(0)
  expect(screen.getAllByText(/Check variables: names/).length).toBeGreaterThan(0)
})
test("variable insertion uses the last text selection and the safe preview never interprets markup", async () => {
  const { user } = await setup(saved)
  const title = screen.getByRole("textbox", { name: "Title template" }) as HTMLInputElement
  fireEvent.change(title, { target: { value: "Hello WORLD!" } })
  title.focus()
  title.setSelectionRange(6, 11)
  fireEvent.select(title)
  fireEvent.blur(title)
  await user.click(screen.getByRole("button", { name: "{name}" }))
  expect(title).toHaveValue("Hello {name}!")
  expect(title).toHaveFocus()
  await waitFor(() => expect(title.selectionStart).toBe(12))
  const example = screen.getByRole("textbox", { name: "Example value 1" })
  fireEvent.change(example, { target: { value: "<img src=x>" } })
  expect(
    within(screen.getByRole("region", { name: "Notification preview" })).getByText("Hello <img src=x>!"),
  ).toBeInTheDocument()
  expect(document.querySelector("img")).toBeNull()
})
test("saving is single-flight, locks closing, and a replaced account cannot close a newer editor", async () => {
  let release!: () => void,
    started = false,
    calls = 0
  const gate = new Promise<void>((resolve) => (release = resolve))
  server.use(
    http.put(`${base}/template`, async () => {
      started = true
      calls++
      await gate
      return HttpResponse.json({ code: 0, data: saved })
    }),
  )
  const { user, queryClient } = await setup(saved)
  try {
    await user.click(screen.getByRole("button", { name: "Save changes" }))
    await waitFor(() => expect(started).toBe(true))
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled()
    await user.keyboard("{Escape}")
    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(calls).toBe(1)
    act(() => useAuthStore.getState().setToken("new-access", "new-refresh"))
    await screen.findByText("Editor closed")
    release()
    await waitFor(() => expect(queryClient.isMutating()).toBe(0))
    expect(calls).toBe(1)
  } finally {
    release()
  }
})
test("permission revocation removes the template form before another submission", async () => {
  const { user } = await setup(saved)
  act(() =>
    useAuthStore.setState({
      userInfo: { ...useAuthStore.getState().userInfo!, isAdmin: false, buttons: ["notification-template:read"] },
    }),
  )
  await screen.findByText("Editor closed")
  expect(screen.queryByRole("textbox", { name: "Title template" })).toBeNull()
  await user.keyboard("{Enter}")
})

test("invalid table names show immediate feedback and prevent mode conversion or saving", async () => {
  const { user } = await setup(saved)
  await user.click(screen.getByRole("button", { name: "Add variable" }))
  expect(screen.getByText(/Check variables: names/)).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Edit JSON" })).toBeDisabled()
  const name = screen.getByRole("textbox", { name: "Variable name 2" })
  await user.type(name, "name")
  expect(screen.getByText(/Check variables: names/)).toBeInTheDocument()
  await user.clear(name)
  await user.type(name, "second")
  expect(screen.queryByText(/Check variables: names/)).toBeNull()
})

test("i18n preview uses the active language without mutating stored translation keys", async () => {
  const { user } = await setup({
    ...saved,
    contentMode: "i18n",
    titleTemplate: "common.success",
    contentTemplate: "common.cancel",
    variableSchema: {},
  })
  const preview = screen.getByRole("region", { name: "Notification preview" })
  expect(within(preview).getByText("Success")).toBeInTheDocument()
  await act(() => i18n.changeLanguage("zh-CN"))
  expect(within(screen.getByRole("region", { name: "通知预览" })).getByText("操作成功")).toBeInTheDocument()
  expect(screen.getByRole("textbox", { name: "标题翻译键" })).toHaveValue("common.success")
  await user.click(screen.getByRole("button", { name: "取消" }))
})

test("raw placeholder submission errors use localized explanations rather than unresolved keys", async () => {
  const { user } = await setup({ ...saved, titleTemplate: "Hello {missing}" })
  await user.click(screen.getByRole("button", { name: "Save changes" }))
  expect(
    await screen.findByText("Variable missing is not defined. Add it to the variable configuration."),
  ).toBeInTheDocument()
  const title = screen.getByRole("textbox", { name: "Title template" })
  fireEvent.change(title, { target: { value: "Hello {name" } })
  await user.click(screen.getByRole("button", { name: "Save changes" }))
  expect(await screen.findByText("Unbalanced braces in {name. Fix the placeholder before saving.")).toBeInTheDocument()
})

test("delivery rules, reserved categories and variable removal are saved through the actual form", async () => {
  let body: unknown
  server.use(
    http.put(`${base}/template`, async ({ request }) => {
      body = await request.json()
      return HttpResponse.json({ code: 0, data: saved })
    }),
  )
  const { user } = await setup(saved)
  await user.click(screen.getByRole("checkbox", { name: "Enable template" }))
  await user.click(screen.getByRole("checkbox", { name: "Mandatory notification" }))
  fireEvent.change(screen.getByRole("combobox", { name: "Notification category" }), {
    target: { value: "system.security" },
  })
  expect(
    screen.getByText(
      "This is a reserved system category. Users cannot opt out even when mandatory notifications are off.",
    ),
  ).toBeInTheDocument()
  await user.click(screen.getByRole("button", { name: "Add variable" }))
  await user.click(screen.getByRole("button", { name: "Remove variable 2" }))
  expect(screen.queryByRole("textbox", { name: "Variable name 2" })).toBeNull()
  await user.click(screen.getByRole("button", { name: "Save changes" }))
  await screen.findByText("Editor closed")
  expect(body).toMatchObject({
    mandatory: true,
    enabled: false,
    category: "system.security",
    variableSchema: { name: { required: true, example: "Ada" } },
  })
})

test("template variable names cannot override i18next runtime options or render resource objects", async () => {
  await setup({
    ...saved,
    contentMode: "i18n",
    titleTemplate: "notificationTemplate.editor",
    contentTemplate: "notification.level.info",
    variableSchema: { returnObjects: { type: "boolean", example: true }, lng: { type: "string", example: "zh-CN" } },
  })
  const preview = screen.getByRole("region", { name: "Notification preview" })
  expect(within(preview).getByText("notificationTemplate.editor")).toBeInTheDocument()
  expect(within(preview).getByText("Info")).toBeInTheDocument()
  expect(within(preview).queryByText("信息")).toBeNull()
  expect(
    within(preview).getByText("Translations missing in this language: notificationTemplate.editor."),
  ).toBeInTheDocument()
})

test("valid translation leaves ignore reserved returnDetails, language and defaultValue variables", async () => {
  await setup({
    ...saved,
    contentMode: "i18n",
    titleTemplate: "notificationTemplate.title",
    contentTemplate: "notificationTemplate.editor.intro",
    variableSchema: {
      returnDetails: { type: "boolean", example: true },
      lng: { type: "string", example: "zh-CN" },
      defaultValue: { type: "string", example: "Wrong fallback" },
    },
  })
  const preview = screen.getByRole("region", { name: "Notification preview" })
  expect(within(preview).getByText("Templates")).toBeInTheDocument()
  expect(
    within(preview).getByText(
      "Configure reusable notification content. Creating a template does not send a notification.",
    ),
  ).toBeInTheDocument()
  expect(within(preview).queryByText("Wrong fallback")).toBeNull()
})

test("isolated i18n variables still interpolate typed zero and ordinary names", async () => {
  await setup({
    ...saved,
    contentMode: "i18n",
    titleTemplate: "home.todayNew",
    contentTemplate: "notificationTemplate.editor.rawHint",
    variableSchema: { count: { type: "integer", example: 0 }, variable: { type: "string", example: "ALPHA" } },
  })
  const preview = screen.getByRole("region", { name: "Notification preview" })
  expect(within(preview).getByText("+0 new today")).toBeInTheDocument()
  expect(
    within(preview).getByText(
      "Write text with placeholders such as ALPHA. Your integration supplies the actual values when sending.",
    ),
  ).toBeInTheDocument()
})

test("JSON object examples cannot be silently saved and correcting the typed table value permits retry", async () => {
  const bodies: unknown[] = []
  server.use(
    http.put(`${base}/template`, async ({ request }) => {
      bodies.push(await request.json())
      return HttpResponse.json({ code: 0, data: saved })
    }),
  )
  const { user } = await setup(saved)
  await user.click(screen.getByRole("button", { name: "Edit JSON" }))
  const json = screen.getByRole("textbox", { name: "Variable schema" }),
    value = '{"name":{"type":"boolean","example":{"bad":true}}}'
  fireEvent.change(json, { target: { value } })
  await user.click(screen.getByRole("button", { name: "Save changes" }))
  await screen.findByText(/Check variables: names/)
  expect(json).toHaveValue(value)
  expect(bodies).toEqual([])
  await user.click(screen.getByRole("button", { name: "Edit table" }))
  await user.type(screen.getByRole("textbox", { name: "Example value 1" }), "false")
  await user.click(screen.getByRole("button", { name: "Save changes" }))
  await screen.findByText("Editor closed")
  expect(bodies).toHaveLength(1)
  expect(bodies[0]).toMatchObject({ variableSchema: { name: { type: "boolean", example: false } } })
})
