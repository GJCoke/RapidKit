/** Patch only changed fields so identical snapshots do not trigger Vue updates. */
function patchFields<T extends object>(target: T, source: T, skip: ReadonlySet<keyof T> = new Set()) {
  for (const key of Object.keys(source) as (keyof T)[]) {
    if (!skip.has(key) && !Object.is(target[key], source[key])) target[key] = source[key]
  }
}

/** Reuse keyed records and the collection, including when membership/order changes. */
export function reconcileRows<T extends object>(target: T[], source: T[], key: (row: T) => string) {
  const existing = new Map(target.map((row) => [key(row), row]))
  const next = source.map((row) => {
    const current = existing.get(key(row))
    if (!current) return { ...row }
    patchFields(current, row)
    return current
  })
  if (target.length !== next.length || next.some((row, index) => row !== target[index])) {
    target.splice(0, target.length, ...next)
  }
}

export function reconcileDashboard(target: Api.Worker.QueueDashboard, source: Api.Worker.QueueDashboard) {
  patchFields(target, source, new Set(["queues", "timeline", "depthTimeline"]))
  reconcileRows(target.queues, source.queues, (row) => row.name)
  reconcileRows(target.timeline, source.timeline, (row) => row.timeBucket)
  reconcileRows(target.depthTimeline, source.depthTimeline, (row) => row.timeBucket)
}
