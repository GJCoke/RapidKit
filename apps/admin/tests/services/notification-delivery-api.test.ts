// @vitest-environment jsdom
import { expect, test } from "vitest"
import { http, HttpResponse } from "msw"
import { server } from "@test/setup/server"
import {
  fetchNotificationDeliveries,
  fetchDeliverySummary,
  retryFailedDeliveries,
} from "@/services/api/notification-delivery"
const base = "http://localhost:16000/api/v1/admin/notification-deliveries",
  id = "10000000-0000-4000-8000-000000000001"
test("delivery services preserve the scoped list filters and use summary and retry endpoints without publishing", async () => {
  const calls: unknown[] = []
  server.use(
    http.get(base, ({ request }) => {
      calls.push([request.method, Object.fromEntries(new URL(request.url).searchParams)])
      return HttpResponse.json({ code: 0, data: { records: [], page: 2, pageSize: 20, total: 21 } })
    }),
    http.get(`${base}/${id}/summary`, ({ request }) => {
      calls.push([request.method, new URL(request.url).pathname])
      return HttpResponse.json({ code: 0, data: { messageId: id, byStatus: { dead: 2 } } })
    }),
    http.post(`${base}/${id}/retry-failed`, async ({ request }) => {
      calls.push([request.method, new URL(request.url).pathname, await request.text()])
      return HttpResponse.json({ code: 0, data: { retried: 2 } })
    }),
  )
  expect(
    (await fetchNotificationDeliveries({ messageId: id, status: "dead", page: 2, pageSize: 20 })).data?.total,
  ).toBe(21)
  expect((await fetchDeliverySummary(id)).data?.byStatus?.dead).toBe(2)
  expect((await retryFailedDeliveries(id)).data?.retried).toBe(2)
  expect(calls).toEqual([
    ["GET", { messageId: id, status: "dead", page: "2", pageSize: "20" }],
    ["GET", `/api/v1/admin/notification-deliveries/${id}/summary`],
    ["POST", `/api/v1/admin/notification-deliveries/${id}/retry-failed`, ""],
  ])
})
