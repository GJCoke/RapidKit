/** Current snapshot health, not a CPU utilization metric. */
import { parseApiTime } from "@/utils/datetime"

export function workerHealth(
  worker: { status: string; lastHeartbeat?: string | null; timezone?: string } | null,
  now = Date.now(),
) {
  if (!worker || worker.status !== "1") return "offline"
  const heartbeat = worker.lastHeartbeat
    ? parseApiTime(worker.lastHeartbeat, worker.timezone || undefined).valueOf()
    : NaN
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
