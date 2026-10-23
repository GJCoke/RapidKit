import type { Worker, QueueOverview } from "@/services/api/worker"
export const queueWorkerId = "10000000-0000-4000-8000-000000000001"
export function queueWorker(overrides: Partial<Worker> = {}): Worker {
  return {
    id: queueWorkerId,
    hostname: "worker@host",
    status: "1",
    concurrency: 4,
    activeTaskCount: 1,
    processedCount: 10,
    activeQueues: ["celery"],
    softwareInfo: {},
    loadAverage: {},
    lastHeartbeat: new Date().toISOString(),
    createTime: "",
    updateTime: "",
    ...overrides,
  }
}
export function queueOverview(overrides: Partial<QueueOverview> = {}): QueueOverview {
  return {
    sampledAt: new Date().toISOString(),
    queues: [{ name: "celery", depth: 2, consumers: 1 }],
    queueDepth: 2,
    onlineWorkers: 1,
    totalWorkers: 1,
    activeTasks: 1,
    concurrency: 4,
    throughput: 0.2,
    success: 8,
    failure: 2,
    retry: 1,
    revoked: 0,
    successRate: 80,
    avgRuntime: 0.2,
    p95Runtime: 0.3,
    timeline: [],
    depthTimeline: [],
    ...overrides,
  }
}
