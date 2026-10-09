type Queue = { name: string; depth: number | null; consumers: number | null }
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
