// @vitest-environment jsdom
import { expect, test } from "vitest"
import { http, HttpResponse } from "msw"
import { server } from "@test/setup/server"
import {
  fetchNotificationTemplates,
  createNotificationTemplate,
  updateNotificationTemplate,
  deleteNotificationTemplate,
  type CreateNotificationTemplateBody,
} from "@/services/api/notification-template"
test("notification template CRUD preserves the OpenAPI paths, filters and immutable update fields", async () => {
  const calls: unknown[] = []
  server.use(
    http.all("http://localhost:16000/api/v1/admin/notification-templates*", async ({ request }) => {
      const url = new URL(request.url),
        text = await request.text()
      calls.push([request.method, url.pathname, Object.fromEntries(url.searchParams), text ? JSON.parse(text) : null])
      return HttpResponse.json({ code: 0, data: request.method === "DELETE" ? null : { id: "template" } })
    }),
  )
  const body: CreateNotificationTemplateBody = {
    level: "info",
    mandatory: false,
    code: "welcome",
    name: "Welcome",
    category: "user.invited",
    contentMode: "raw",
    titleTemplate: "Hello {name}",
    contentTemplate: "Welcome",
    variableSchema: { name: { type: "string", required: true, example: "Alex", default: "Reader" } },
    defaultChannels: ["in_app"],
    enabled: false,
  }
  await fetchNotificationTemplates({ page: 2, pageSize: 20, enabled: false, keyword: "welcome" })
  await createNotificationTemplate(body)
  await updateNotificationTemplate("template", {
    name: "Updated",
    variableSchema: body.variableSchema,
    defaultChannels: ["in_app"],
    enabled: false,
  })
  const deleted = await deleteNotificationTemplate("template")
  expect(deleted.error).toBeNull()
  expect(deleted.data).toBeNull()
  expect(calls).toEqual([
    [
      "GET",
      "/api/v1/admin/notification-templates",
      { page: "2", pageSize: "20", enabled: "false", keyword: "welcome" },
      null,
    ],
    ["POST", "/api/v1/admin/notification-templates", {}, body],
    [
      "PUT",
      "/api/v1/admin/notification-templates/template",
      {},
      { name: "Updated", variableSchema: body.variableSchema, defaultChannels: ["in_app"], enabled: false },
    ],
    ["DELETE", "/api/v1/admin/notification-templates/template", {}, null],
  ])
})
