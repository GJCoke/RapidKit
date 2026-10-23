// @vitest-environment jsdom
import { expect, test } from "vitest"
import { http, HttpResponse } from "msw"
import { server } from "@test/setup/server"
import { fetchNotificationPreferences, updateNotificationPreference } from "@/services/api/notification-preference"
const base = "http://localhost:16000/api/v1/notification-preferences"
test("preferences use authenticated GET and category PUT with a strict boolean body", async () => {
  const item = {
      category: "user.mention",
      nameKey: "notification.category.userMention",
      enabled: true,
      closable: true,
      reserved: false,
    },
    calls: unknown[] = []
  server.use(
    http.get(base, () => HttpResponse.json({ code: 0, data: [item] })),
    http.put(`${base}/:category`, async ({ request, params }) => {
      calls.push([request.method, params.category, await request.json()])
      return HttpResponse.json({ code: 0, data: { ...item, enabled: false } })
    }),
  )
  expect((await fetchNotificationPreferences()).data).toEqual([item])
  expect((await updateNotificationPreference(item.category, { enabled: false })).data?.enabled).toBe(false)
  expect(calls).toEqual([["PUT", "user.mention", { enabled: false }]])
})
