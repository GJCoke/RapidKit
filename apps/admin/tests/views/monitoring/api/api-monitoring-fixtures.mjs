import assert from "node:assert/strict"
export const monitoringPattern = /\/(?:api\/v1|proxy-default)\/system\/stats\/api\//
export function monitoringFixtures() {
  const methods = ["GET", "POST", "PUT", "DELETE", "PATCH"],
    rows = Array.from({ length: 61 }, (_, index) => ({
      path: `/api/v1/migration/endpoint-${index + 1}`,
      method: methods[index % methods.length],
      requestCount: 1000 - index,
      errorCount: index === 0 ? 5 : index === 1 ? 1 : 0,
      errorRate: index === 0 ? 5 : index === 1 ? 1 : 0,
      avgMs: 25 + index,
      p95Ms: index === 0 ? 3001 : index === 1 ? 1001 : 50 + index,
    })),
    state = { rows, calls: [], fail: new Set(), gates: new Map(), empty: false }
  const names = {
    request_count: "requestCount",
    error_count: "errorCount",
    error_rate: "errorRate",
    avg_ms: "avgMs",
    p95_ms: "p95Ms",
    requests: "requestCount",
  }
  async function handler(route) {
    const request = route.request()
    assert.equal(request.method(), "GET")
    const url = new URL(request.url()),
      kind = url.pathname.split("/").at(-1),
      query = Object.fromEntries(url.searchParams),
      key = kind === "top" ? `top-${query.sortBy}` : kind
    state.calls.push({ kind, key, query })
    if (state.gates.has(key)) await state.gates.get(key)
    const reply = (data) =>
      route.fulfill({
        json: state.fail.has(key)
          ? { code: 422, message: "API monitoring fixture failure", data: null }
          : { code: 0, data },
      })
    if (kind === "overview")
      return reply({
        totalRequests: state.empty ? 0 : 1000,
        totalErrors: state.empty ? 0 : 50,
        avgErrorRate: state.empty ? 0 : 5,
        avgMs: state.empty ? 0 : 25,
        busiestMethod: "GET",
        busiestPath: rows[0].path,
        busiestCount: 100,
      })
    if (kind === "distribution")
      return reply(
        state.empty
          ? []
          : [
              { path: rows[0].path, method: "GET", requestCount: 750, percentage: 75 },
              { path: "other", method: "*", requestCount: 250, percentage: 25 },
            ],
      )
    if (kind === "trend")
      return reply(
        state.empty
          ? []
          : [
              { timeBucket: "2026-11-01T01:00:00-04:00", requestCount: 10, errorCount: 1 },
              { timeBucket: "2026-11-01T01:00:00-05:00", requestCount: 20, errorCount: 2 },
              { timeBucket: "2026-11-01T02:00:00-05:00", requestCount: 30, errorCount: 3 },
            ],
      )
    const field = names[query.sortBy] || "requestCount",
      sorted = state.empty
        ? []
        : [...state.rows]
            .filter((row) => kind !== "list" || !query.keyword || row.path.includes(query.keyword))
            .sort((a, b) => (a[field] - b[field]) * (query.sortOrder === "asc" ? 1 : -1))
    if (kind === "top") return reply(sorted.slice(0, Number(query.limit || 10)))
    assert.equal(kind, "list")
    const page = Number(query.page || 1),
      pageSize = Number(query.pageSize || 20)
    return reply({
      records: sorted.slice((page - 1) * pageSize, page * pageSize),
      total: sorted.length,
      page,
      pageSize,
    })
  }
  return { state, handler }
}
