// @vitest-environment jsdom
import { expect, test } from "vitest"
import { http, HttpResponse } from "msw"
import { server } from "@test/setup/server"
import {
  fetchSchedules,
  fetchSchedule,
  createSchedule,
  updateSchedule,
  toggleSchedule,
  deleteSchedule,
  previewSchedule,
} from "@/services/api/schedule"
const base = "http://localhost:16000/api/v1/schedules",
  id = "10000000-0000-4000-8000-000000000001"
test("schedule reads preserve disabled filters and source-sized pagination without requesting unsupported fields", async () => {
  const calls: unknown[] = []
  server.use(
    http.get(`${base}*`, ({ request }) => {
      const url = new URL(request.url)
      calls.push([url.pathname, Object.fromEntries(url.searchParams)])
      return HttpResponse.json({ code: 0, data: {} })
    }),
  )
  await fetchSchedules({ page: 2, pageSize: 500, enabled: false, taskName: "sample.job" })
  await fetchSchedule(id)
  expect(calls).toEqual([
    ["/api/v1/schedules", { page: "2", pageSize: "500", enabled: "false", taskName: "sample.job" }],
    [`/api/v1/schedules/${id}`, {}],
  ])
})
test("schedule writes and preview use exact contract methods/bodies and delete preserves a false ack", async () => {
  const calls: unknown[] = []
  server.use(
    http.all(`${base}*`, async ({ request }) => {
      const raw = await request.text()
      calls.push([request.method, new URL(request.url).pathname, raw ? JSON.parse(raw) : null])
      return HttpResponse.json({ code: 0, data: request.method === "DELETE" ? false : {} })
    }),
  )
  const data = {
    name: "Schedule",
    task: "sample.job",
    description: "literal",
    enabled: false,
    args: [null, true],
    kwargs: { verbose: false },
    schedule: { type: "interval" as const, every: 5, period: "minutes" as const },
  }
  await createSchedule(data)
  await updateSchedule(id, data)
  await toggleSchedule(id)
  expect((await deleteSchedule(id)).data).toBe(false)
  await previewSchedule({ schedule: { type: "solar", event: "sunrise", latitude: 31.2304, longitude: 121.4737 } })
  expect(calls).toEqual([
    ["POST", "/api/v1/schedules", data],
    ["PUT", `/api/v1/schedules/${id}`, data],
    ["PATCH", `/api/v1/schedules/${id}/toggle`, null],
    ["DELETE", `/api/v1/schedules/${id}`, null],
    [
      "POST",
      "/api/v1/schedules/preview",
      { schedule: { type: "solar", event: "sunrise", latitude: 31.2304, longitude: 121.4737 } },
    ],
  ])
})
