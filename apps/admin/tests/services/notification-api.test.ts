// @vitest-environment jsdom
import { expect, test } from "vitest"
import { http, HttpResponse } from "msw"
import { server } from "@test/setup/server"
import {
  fetchNotifications,
  fetchNotificationUnread,
  fetchReadNotification,
  fetchReadAllNotifications,
  fetchArchiveNotification,
  fetchDeleteNotification,
  fetchTopBanner,
} from "@/services/api/notification"

test("notification services preserve cursor filters and mutation methods without bodies", async () => {
  const calls: unknown[] = []
  server.use(
    http.all("http://localhost:16000/api/v1/notifications*", async ({ request }) => {
      const url = new URL(request.url)
      calls.push([request.method, url.pathname, Object.fromEntries(url.searchParams), await request.text()])
      return HttpResponse.json({ code: 0, data: {} })
    }),
  )
  await fetchNotifications({
    cursor: "next-page",
    size: 20,
    unreadOnly: true,
    archived: "all",
    category: "system.security",
    level: "warning",
    createdFrom: "2026-10-01",
    createdTo: "2026-10-23",
  })
  await fetchNotificationUnread()
  await fetchReadNotification("item")
  await fetchReadAllNotifications()
  await fetchArchiveNotification("item")
  await fetchDeleteNotification("item")
  await fetchTopBanner()
  expect(calls).toEqual([
    [
      "GET",
      "/api/v1/notifications",
      {
        cursor: "next-page",
        size: "20",
        unreadOnly: "true",
        archived: "all",
        category: "system.security",
        level: "warning",
        createdFrom: "2026-10-01",
        createdTo: "2026-10-23",
      },
      "",
    ],
    ["GET", "/api/v1/notifications/unread-count", {}, ""],
    ["PATCH", "/api/v1/notifications/item/read", {}, ""],
    ["POST", "/api/v1/notifications/read-all", {}, ""],
    ["PATCH", "/api/v1/notifications/item/archive", {}, ""],
    ["DELETE", "/api/v1/notifications/item", {}, ""],
    ["GET", "/api/v1/notifications/top-banner", {}, ""],
  ])
})
