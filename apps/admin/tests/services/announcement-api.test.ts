// @vitest-environment jsdom
import { expect, test } from "vitest"
import { http, HttpResponse } from "msw"
import { server } from "@test/setup/server"
import {
  fetchAnnouncements,
  fetchAnnouncement,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  publishAnnouncement,
  cancelAnnouncement,
  recallAnnouncement,
  previewAnnouncementAudience,
  previewAnnouncementContent,
  fetchAnnouncementActionTargets,
  previewAnnouncementAction,
  checkAnnouncementBanner,
  type AnnouncementBody,
} from "@/services/api/announcement"
import { fetchNotificationTemplates } from "@/services/api/notification-template"

const base = "http://localhost:16000/api/v1/admin"
test("announcement CRUD, previews and banner publishing retain the OpenAPI fields and HTTP methods", async () => {
  const calls: unknown[] = []
  server.use(
    http.all(`${base}/*`, async ({ request }) => {
      const url = new URL(request.url)
      const text = await request.text()
      calls.push([request.method, url.pathname, Object.fromEntries(url.searchParams), text ? JSON.parse(text) : null])
      return HttpResponse.json({ code: 0, data: { messageId: "created" } })
    }),
  )
  const body: AnnouncementBody = {
    displayMode: "inbox",
    replaceCurrent: false,
    replaceScheduled: false,
    category: "admin.announcement",
    level: "warning",
    rawTitle: "Notice",
    rawContent: "Body",
    rawFormat: "markdown",
    audience: [{ type: "department", value: "dept", includeDescendants: true }],
    mandatory: true,
    channels: ["in_app"],
    saveAsDraft: true,
    action: { type: "menu", menuId: "menu", params: { id: "42" }, query: { keyword: "Lin" } },
  }
  const content = {
    templateCode: "welcome",
    templateVariables: { count: 3 },
    variableBindings: { name: { source: "recipient" as const, field: "name" as const } },
    audience: [{ type: "all" as const, includeDescendants: false }],
    previewUserId: "reader",
  }
  const banner = { bannerRevision: 4, replaceCurrent: true, replaceScheduled: false }
  const created = await createAnnouncement(body)
  expect(created.data?.messageId).toBe("created")
  await fetchAnnouncements({
    page: 2,
    pageSize: 20,
    category: "admin.announcement",
    status: "scheduled",
    displayMode: "top_banner",
  })
  await fetchAnnouncement("message")
  await updateAnnouncement("message", body)
  await deleteAnnouncement("message")
  await publishAnnouncement("message", banner)
  await publishAnnouncement("draft")
  await cancelAnnouncement("message")
  await recallAnnouncement("message")
  await previewAnnouncementAudience({ audience: body.audience ?? [] })
  await previewAnnouncementContent(content)
  await fetchAnnouncementActionTargets()
  await previewAnnouncementAction({ type: "external", url: "https://example.com", label: "Open" })
  await checkAnnouncementBanner({ messageId: "message", publishAt: "2026-10-25T08:00:00" })
  expect(calls).toEqual([
    ["POST", "/api/v1/admin/notifications", {}, body],
    [
      "GET",
      "/api/v1/admin/notifications",
      { page: "2", pageSize: "20", category: "admin.announcement", status: "scheduled", displayMode: "top_banner" },
      null,
    ],
    ["GET", "/api/v1/admin/notifications/message", {}, null],
    ["PUT", "/api/v1/admin/notifications/message", {}, body],
    ["DELETE", "/api/v1/admin/notifications/message", {}, null],
    ["POST", "/api/v1/admin/notifications/message/publish", {}, banner],
    ["POST", "/api/v1/admin/notifications/draft/publish", {}, null],
    ["POST", "/api/v1/admin/notifications/message/cancel", {}, null],
    ["POST", "/api/v1/admin/notifications/message/recall", {}, null],
    ["POST", "/api/v1/admin/notifications/audience-preview", {}, { audience: body.audience }],
    ["POST", "/api/v1/admin/notifications/content-preview", {}, content],
    ["GET", "/api/v1/admin/notifications/action-targets", {}, null],
    [
      "POST",
      "/api/v1/admin/notifications/action-preview",
      {},
      { type: "external", url: "https://example.com", label: "Open" },
    ],
    [
      "POST",
      "/api/v1/admin/notifications/banner-check",
      {},
      { messageId: "message", publishAt: "2026-10-25T08:00:00" },
    ],
  ])
})
test("announcement template lookup sends enabled and keyword without inventing a separate endpoint", async () => {
  let query: unknown
  server.use(
    http.get(`${base}/notification-templates`, ({ request }) => {
      query = Object.fromEntries(new URL(request.url).searchParams)
      return HttpResponse.json({ code: 0, data: { records: [], page: 1, pageSize: 100, total: 0 } })
    }),
  )
  const result = await fetchNotificationTemplates({ page: 1, pageSize: 100, enabled: true, keyword: "welcome" })
  expect(query).toEqual({ page: "1", pageSize: "100", enabled: "true", keyword: "welcome" })
  expect(result.data?.records).toEqual([])
})
