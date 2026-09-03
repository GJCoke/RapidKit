import assert from "node:assert/strict"
import test from "node:test"
import { createOverviewStats, mapActivityItems, mapTrendPoints, resolveDashboardQueries } from "./dashboard-data"

const translate = (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key)

test("overview payloads map to five real stat card values", () => {
  const stats = createOverviewStats(
    {
      users: { total: 42, todayNew: 3, yesterdayNew: 1, onlineCount: 7 },
      tasks: { total: 12, success: 10, failure: 1, retry: 1, revoked: 0, successRate: 83.33, avgRuntime: 1.2 },
      workers: [
        {
          id: "worker-1",
          createTime: "2026-09-01T00:00:00",
          updateTime: "2026-09-01T00:00:00",
          hostname: "online",
          status: "1",
          activeQueues: ["default"],
          concurrency: 2,
          processedCount: 10,
          activeTaskCount: 1,
          loadAverage: {},
          softwareInfo: {},
          lastHeartbeat: "2026-09-01T00:00:00",
        },
        {
          id: "worker-2",
          createTime: "2026-09-01T00:00:00",
          updateTime: "2026-09-01T00:00:00",
          hostname: "offline",
          status: "2",
          activeQueues: [],
          concurrency: 0,
          processedCount: 4,
          activeTaskCount: 0,
          loadAverage: {},
          softwareInfo: {},
          lastHeartbeat: null,
        },
      ],
      errors: { http5XxCount: 2, bizErrorCount: 1, totalRequests: 100, errorRate: 3, sparkline24H: [] },
    },
    translate,
    (value) => `n:${value}`,
    (value) => `p:${value}`,
  )

  assert.deepEqual(
    stats.map(({ label, value, delta }) => ({ label, value, delta })),
    [
      { label: "home.userTotal", value: "n:42", delta: 'home.todayNew:{"count":"n:3"}' },
      { label: "home.onlineUsers", value: "n:7", delta: undefined },
      { label: "home.workerCount", value: "n:1", delta: undefined },
      { label: "home.todayTasks", value: "n:12", delta: 'home.taskSuccess:{"count":"n:10"}' },
      { label: "home.apiErrorRate", value: "p:0.03", delta: undefined },
    ],
  )
})

test("trend and activity payloads map backend fields into presentation props", () => {
  assert.deepEqual(
    mapTrendPoints([{ timeBucket: "2026-09-01T00:00:00", newUsers: 5 }], (value) => `date:${value}`),
    [{ name: "date:2026-09-01T00:00:00", value: 5 }],
  )
  assert.deepEqual(
    mapActivityItems(
      [
        {
          id: "activity-1",
          createTime: "2026-09-01T10:00:00",
          updateTime: "2026-09-01T10:00:00",
          category: "task",
          eventCode: "task.succeeded",
          level: "success",
          actorId: null,
          actorName: null,
          subjectType: "task",
          subjectId: "task-1",
          subjectName: "cleanup",
          titleKey: "page.home.dashboard.activity.taskSucceeded",
          titleParams: { task: "cleanup", duration: 1.25 },
          descriptionKey: null,
          descriptionParams: {},
          metadata: {},
          occurredAt: "2026-09-01T10:00:00",
        },
      ],
      translate,
      (value) => `time:${value}`,
    ),
    [
      {
        id: "activity-1",
        title: 'home.activity.taskSucceeded:{"task":"cleanup","duration":1.25}',
        time: "time:2026-09-01T10:00:00",
      },
    ],
  )
})

test("module query state handles pending, thrown, flat error, and ready payloads", () => {
  assert.equal(resolveDashboardQueries([{ isPending: true, isError: false }]), "loading")
  assert.equal(resolveDashboardQueries([{ isPending: false, isError: true }]), "error")
  assert.equal(
    resolveDashboardQueries([{ isPending: false, isError: false, data: { data: null, error: new Error("network") } }]),
    "error",
  )
  assert.equal(
    resolveDashboardQueries([{ isPending: false, isError: false, data: { data: [], error: null } }]),
    "ready",
  )
})
