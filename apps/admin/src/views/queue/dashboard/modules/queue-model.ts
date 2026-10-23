import { z } from "zod"
import { parseApiDate } from "@/shared/date-time"
import type { QueueOverview, Worker } from "@/services/api/worker"
type Queue = QueueOverview["queues"][number]
export function queueState(queue: Pick<Queue, "depth" | "consumers">) {
  if (queue.depth === null || queue.consumers === null) return "unknown"
  if (queue.depth > 0 && queue.consumers === 0) return "blocked"
  return queue.consumers > 0 ? "healthy" : "idle"
}
export function sortQueues(queues: Queue[]) {
  return [...queues].sort(
    (a, b) =>
      Number(queueState(b) === "blocked") - Number(queueState(a) === "blocked") || (b.depth ?? -1) - (a.depth ?? -1),
  )
}
export function utilization(active: number, capacity: number) {
  return capacity > 0 ? Math.round((active / capacity) * 1000) / 10 : null
}
export function workerHealth(worker: { status?: string; lastHeartbeat?: string | null } | null, now = Date.now()) {
  if (!worker || worker.status !== "1") return "offline"
  const heartbeat = worker.lastHeartbeat ? parseApiDate(worker.lastHeartbeat).getTime() : NaN
  if (!Number.isFinite(heartbeat)) return "unknown"
  return now - heartbeat > 60000 ? "stale" : "online"
}
export function workerCapacity(active: number, concurrency: number) {
  return {
    percent: concurrency > 0 ? (active / concurrency) * 100 : null,
    available: concurrency > 0 ? Math.max(0, concurrency - active) : null,
    overCapacity: concurrency > 0 && active > concurrency,
  }
}
export function validResize(n: number | null, concurrency: number, action: "grow" | "shrink") {
  return n !== null && Number.isInteger(n) && n >= 1 && n <= 10 && (action === "grow" || n < concurrency)
}
export function normalizeWorker(
  worker: Pick<Worker, "id" | "hostname" | "createTime" | "updateTime"> & Partial<Worker>,
) {
  return {
    ...worker,
    status: worker.status ?? "1",
    activeQueues: (worker.activeQueues ?? []).filter((queue): queue is string => typeof queue === "string"),
    concurrency: worker.concurrency ?? 0,
    activeTaskCount: worker.activeTaskCount ?? 0,
    processedCount: worker.processedCount ?? 0,
    softwareInfo: worker.softwareInfo ?? {},
    loadAverage: worker.loadAverage ?? {},
    lastHeartbeat: worker.lastHeartbeat ?? null,
  }
}
export type NormalizedWorker = ReturnType<typeof normalizeWorker>
export function queueRecordLocation(
  days: number,
  filters: { task?: string; worker?: string; status?: string },
  now = Date.now(),
) {
  const query = new URLSearchParams({
    view: "records",
    range: "custom",
    startTime: new Date(now - days * 86400000).toISOString(),
    endTime: new Date(now).toISOString(),
    ...filters,
  })
  return { pathname: "/queue/task", search: `?${query}` }
}
export const workerStatusEvent = z.object({
  hostname: z.string(),
  status: z.enum(["1", "2"]),
  concurrency: z.number().int().nonnegative(),
  activeTaskCount: z.number().int().nonnegative(),
  processedCount: z.number().int().nonnegative(),
  activeQueues: z.array(z.string()),
  lastHeartbeat: z.string().nullable(),
})
