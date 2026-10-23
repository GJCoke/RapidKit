// @vitest-environment jsdom
import { expect, test } from "vitest"
import { http, HttpResponse } from "msw"
import { server } from "@test/setup/server"
import {
  fetchWorkers,
  fetchWorkerDetail,
  fetchWorkerTasks,
  fetchQueueOverview,
  fetchTaskRanking,
  fetchWorkerRanking,
  sendWorkerCommand,
} from "@/services/api/worker"
const base = "http://localhost:16000/api/v1",
  id = "10000000-0000-4000-8000-000000000001"
test("queue services preserve overview windows, ranked statistics and independent worker inspections", async () => {
  const calls: unknown[] = []
  server.use(
    http.get(`${base}/*`, ({ request }) => {
      const url = new URL(request.url)
      calls.push([url.pathname, Object.fromEntries(url.searchParams)])
      return HttpResponse.json({ code: 0, data: [] })
    }),
  )
  await fetchWorkers()
  await fetchWorkerDetail(id)
  await fetchWorkerTasks(id, "active")
  await fetchWorkerTasks(id, "reserved")
  await fetchQueueOverview({ days: 7 })
  await fetchTaskRanking({
    startTime: "2026-10-01T00:00:00Z",
    endTime: "2026-10-08T00:00:00Z",
    page: 1,
    pageSize: 10,
    sortBy: "total",
    sortOrder: "desc",
  })
  await fetchWorkerRanking({ days: 7 })
  expect(calls).toEqual([
    ["/api/v1/workers/all", {}],
    [`/api/v1/workers/${id}`, {}],
    [`/api/v1/workers/${id}/tasks/active`, {}],
    [`/api/v1/workers/${id}/tasks/reserved`, {}],
    ["/api/v1/tasks/stats/dashboard", { days: "7" }],
    [
      "/api/v1/tasks/stats/by-name",
      {
        startTime: "2026-10-01T00:00:00Z",
        endTime: "2026-10-08T00:00:00Z",
        page: "1",
        pageSize: "10",
        sortBy: "total",
        sortOrder: "desc",
      },
    ],
    ["/api/v1/tasks/stats/by-worker", { days: "7" }],
  ])
})
test("worker commands use six distinct POST routes and only the contract's request body", async () => {
  const calls: unknown[] = []
  server.use(
    http.post(`${base}/workers/${id}/*`, async ({ request }) => {
      const text = await request.text()
      calls.push([new URL(request.url).pathname, text ? JSON.parse(text) : null])
      return HttpResponse.json({ code: 0, data: { success: true, message: "Accepted" } })
    }),
  )
  for (const command of [
    { type: "ping" },
    { type: "shutdown" },
    { type: "grow", n: 2 },
    { type: "shrink", n: 1 },
    { type: "add", queue: "critical" },
    { type: "cancel", queue: "default" },
  ] as const)
    expect((await sendWorkerCommand(id, command)).data?.success).toBe(true)
  expect(calls).toEqual([
    [`/api/v1/workers/${id}/ping`, null],
    [`/api/v1/workers/${id}/shutdown`, null],
    [`/api/v1/workers/${id}/pool/grow`, { n: 2 }],
    [`/api/v1/workers/${id}/pool/shrink`, { n: 1 }],
    [`/api/v1/workers/${id}/queues/add`, { queue: "critical" }],
    [`/api/v1/workers/${id}/queues/cancel`, { queue: "default" }],
  ])
})
