// @vitest-environment jsdom
import { expect, test } from "vitest"
import { http, HttpResponse } from "msw"
import { server } from "@test/setup/server"
import {
  fetchTasks,
  fetchTask,
  fetchRegisteredTasks,
  fetchTaskGroups,
  triggerTask,
  revokeTask,
} from "@/services/api/task"
const base = "http://localhost:16000/api/v1"
test("task reads preserve record matching, UTC windows, ranked pagination and detail identities", async () => {
  const reads: unknown[] = []
  server.use(
    http.get(`${base}/*`, ({ request }) => {
      const url = new URL(request.url)
      reads.push([url.pathname, Object.fromEntries(url.searchParams)])
      return HttpResponse.json({ code: 0, data: {} })
    }),
  )
  await fetchTasks({
    page: 2,
    pageSize: 500,
    taskName: "job.exact",
    taskNameMatch: "exact",
    workerHostname: "worker@one",
    status: "4",
    startTime: "2026-10-01T00:00:00Z",
    endTime: "2026-10-08T00:00:00Z",
  })
  await fetchTask("job-123")
  await fetchRegisteredTasks()
  await fetchTaskGroups({
    page: 3,
    pageSize: 50,
    taskName: "job",
    workerHostname: "worker@one",
    sortBy: "failure",
    sortOrder: "asc",
  })
  expect(reads).toEqual([
    [
      "/api/v1/tasks",
      {
        page: "2",
        pageSize: "500",
        taskName: "job.exact",
        taskNameMatch: "exact",
        workerHostname: "worker@one",
        status: "4",
        startTime: "2026-10-01T00:00:00Z",
        endTime: "2026-10-08T00:00:00Z",
      },
    ],
    ["/api/v1/tasks/job-123", {}],
    ["/api/v1/tasks/registered", {}],
    [
      "/api/v1/tasks/stats/by-name",
      { page: "3", pageSize: "50", taskName: "job", workerHostname: "worker@one", sortBy: "failure", sortOrder: "asc" },
    ],
  ])
})
test("trigger sends only task name and JSON arguments; revoke has no body and preserves a false acknowledgement", async () => {
  const writes: unknown[] = []
  server.use(
    http.post(`${base}/tasks/*`, async ({ request }) => {
      const raw = await request.text()
      writes.push([new URL(request.url).pathname, raw ? JSON.parse(raw) : null])
      return HttpResponse.json({ code: 0, data: request.url.endsWith("/revoke") ? false : { taskId: "submitted-one" } })
    }),
  )
  expect(
    (
      await triggerTask({
        taskName: "sample.job",
        args: [null, true, { nested: [1, "x"] }],
        kwargs: { verbose: false },
      })
    ).data?.taskId,
  ).toBe("submitted-one")
  expect((await revokeTask("job-123")).data).toBe(false)
  expect(writes).toEqual([
    [
      "/api/v1/tasks/trigger",
      { taskName: "sample.job", args: [null, true, { nested: [1, "x"] }], kwargs: { verbose: false } },
    ],
    ["/api/v1/tasks/job-123/revoke", null],
  ])
})
