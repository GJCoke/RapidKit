import type { ActivityItem, OperationsOverview, InstanceResource } from "@/services/api/dashboard"
export function homeOverview(): OperationsOverview {
  return {
    generatedAt: "2026-10-24T00:00:00Z",
    timezone: "Asia/Shanghai",
    summary: {
      servers: { healthy: 2, total: 3, status: "degraded" },
      activeUsers: { today: 0, yesterday: 3, changePercent: -100 },
      tasks: { today: 12, yesterday: 10, changePercent: 20 },
      apiErrorRate: { today: 0, yesterday: 2, changePoints: -2 },
    },
    trend: [{ date: "2026-10-24", requestCount: 120, avgResponseMs: 35 }],
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
}
export function homeActivity(id: string, category: ActivityItem["category"] = "task"): ActivityItem {
  return {
    id,
    createTime: "",
    updateTime: "",
    category,
    level: "success",
    eventCode: "task.succeeded",
    subjectType: "task",
    titleKey: "page.home.dashboard.activity.taskSucceeded",
    titleParams: { task: id, duration: 1.236 },
    descriptionKey: "page.home.dashboard.activity.taskFailedDescription",
    descriptionParams: { error: "Fixture detail" },
    actorName: "Operator",
    occurredAt: "2026-10-24T00:00:00Z",
  }
}
export function homeResource(hostname: string, cpuPercent: number): InstanceResource {
  return {
    hostname,
    cpuPercent,
    memoryUsed: 10,
    memoryTotal: 100,
    memoryPercent: 10,
    diskUsed: 20,
    diskTotal: 100,
    diskPercent: 20,
    netSent: 1024,
    netRecv: 1048576,
  }
}
