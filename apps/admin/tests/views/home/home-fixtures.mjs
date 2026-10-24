export const homePattern =
  /\/(?:api\/v1|proxy-default)\/(?:dashboard\/capabilities|system\/stats\/(?:operations-overview|health|infrastructure|business|resources|api\/(?:distribution|top|trend))|system\/activities|users\/admin-contacts)(?:\?|$)/
export const capabilities = [
  "dashboard.overview",
  "dashboard.application-health",
  "dashboard.activity",
  "dashboard.business",
  "dashboard.infrastructure",
  "dashboard.api-monitoring",
]
export const resource = (hostname, cpuPercent, memoryUsed = 10, memoryTotal = 100) => ({
  hostname,
  cpuPercent,
  memoryUsed,
  memoryTotal,
  memoryPercent: (memoryUsed / memoryTotal) * 100,
  diskUsed: 20,
  diskTotal: 100,
  diskPercent: 20,
  netSent: 1024,
  netRecv: 1048576,
})
export const activity = (id, category = "task") => ({
  id,
  createTime: "2026-10-24 08:00:00",
  updateTime: "2026-10-24 08:00:00",
  category,
  level: "success",
  eventCode: "task.succeeded",
  actorId: null,
  actorName: "Migration Operator",
  subjectType: "task",
  subjectId: null,
  subjectName: id,
  titleKey: "page.home.dashboard.activity.taskSucceeded",
  titleParams: { task: id, duration: 1.236 },
  descriptionKey: "page.home.dashboard.activity.taskFailedDescription",
  descriptionParams: { error: "Migration detail" },
  metadata: {},
  occurredAt: "2026-10-24T00:00:00Z",
})
export const failure = (path = "/fixture-failure") => ({
  path,
  method: "GET",
  requestCount: 10,
  errorCount: 4,
  errorRate: 40,
  avgMs: 2,
  p95Ms: 3,
})
export function homeFixtures() {
  const state = {
    active: false,
    syncStatus: "healthy",
    activityItems: null,
    allowed: [...capabilities],
    failed: new Set(),
    empty: new Set(),
    gates: new Map(),
    calls: [],
    instances: [resource("node-a", 10, 10, 100), resource("node-b", 90, 900, 1000)],
  }
  const overview = {
    generatedAt: "2026-10-24T00:00:00Z",
    timezone: "Asia/Shanghai",
    summary: {
      servers: { healthy: 2, total: 3, status: "degraded" },
      activeUsers: { today: 0, yesterday: 3, changePercent: -100 },
      tasks: { today: 12, yesterday: 10, changePercent: 20 },
      apiErrorRate: { today: 0, yesterday: 2, changePoints: -2 },
    },
    trend: [
      { date: "2026-10-23", requestCount: 100, avgResponseMs: 20 },
      { date: "2026-10-24", requestCount: 150, avgResponseMs: 40 },
    ],
    system: {
      startedAt: "2026-10-23T00:00:00Z",
      uptimeSeconds: 90061,
      queueDepth: 4,
      queueDepthYesterday: 2,
      queueDepthChangePercent: 100,
      lastSyncAt: "2026-10-24T00:00:00Z",
      syncStatus: "healthy",
      taskSuccessRate7D: 95,
      previousTaskSuccessRate7D: 90,
      taskSuccessRateChangePoints: 5,
    },
  }
  return {
    state,
    async handler(route) {
      const request = route.request(),
        url = new URL(request.url()),
        path = url.pathname.replace(/^\/(?:api\/v1|proxy-default)/, ""),
        kind = path.split("/").at(-1)
      state.calls.push({ kind, path, method: request.method(), params: [...url.searchParams] })
      if (state.gates.has(kind)) await state.gates.get(kind)
      if (state.failed.has(kind))
        return route.fulfill({ json: { code: 15001, message: "Migration home fixture failure", data: null } })
      let data
      switch (kind) {
        case "capabilities":
          data = { allowedModules: state.allowed, revision: "migration-home" }
          break
        case "operations-overview":
          data = {
            ...overview,
            system: {
              ...overview.system,
              syncStatus: state.syncStatus,
              lastSyncAt: ["unavailable", "failed"].includes(state.syncStatus) ? null : overview.system.lastSyncAt,
            },
            trend: state.empty.has(kind) ? [] : overview.trend,
          }
          break
        case "health":
          data = { qps: 2, p50Ms: 3, p95Ms: 4, http5Xx1H: 0, bizErrors1H: 1, wsConnections: 7 }
          break
        case "business":
          data = { roles: 101, menus: 102, routers: 103, schedules: 104 }
          break
        case "infrastructure":
          data = {
            pg: { status: "healthy", latencyMs: 1, details: null },
            redis: { status: "degraded", latencyMs: 2, details: null },
            minio: { status: "down", latencyMs: 3, details: null },
          }
          break
        case "resources":
          data = {
            instances: state.empty.has(kind) ? [] : state.instances,
            summary: resource("summary", 50, 910, 1100),
          }
          break
        case "activities": {
          const category = url.searchParams.get("categories")
          data = {
            items: state.empty.has(kind)
              ? []
              : category
                ? [activity("filtered-user", category)]
                : (state.activityItems ?? Array.from({ length: 20 }, (_, i) => activity(`migration-task-${i}`))),
            size: 20,
            nextCursor: null,
          }
          break
        }
        case "distribution":
          data = state.empty.has(kind)
            ? []
            : [{ method: "GET", path: "/fixture-api", requestCount: 150, percentage: 100 }]
          break
        case "top":
          data = state.empty.has(kind) ? [] : [failure()]
          break
        case "trend":
          data = state.empty.has(kind)
            ? []
            : [
                { timeBucket: "2026-10-23T23:00:00Z", requestCount: 100, errorCount: 2, avgMs: 1, p95Ms: 2 },
                { timeBucket: "2026-10-24T00:00:00Z", requestCount: 150, errorCount: 4, avgMs: 2, p95Ms: 3 },
              ]
          break
        case "admin-contacts":
          data = state.empty.has(kind)
            ? []
            : Array.from({ length: 4 }, (_, i) => ({
                id: `00000000-0000-4000-8000-00000000000${i}`,
                name: `Migration Admin ${i}`,
                avatar: null,
                email: `migration-admin-${i}@example.test`,
              }))
          break
        default:
          throw new Error(`Unexpected home fixture path: ${path}`)
      }
      return route.fulfill({ json: { code: 0, message: "OK", data } })
    },
  }
}
