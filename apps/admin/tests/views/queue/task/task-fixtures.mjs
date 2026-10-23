import assert from "node:assert/strict"
export const taskPattern = /\/(?:api\/v1|proxy-default)\/tasks(?:\?|\/|$)/
export const taskName = "migration.tasks.example",
  workerName = "worker@migration-host"
export function taskFixtures() {
  const stamp = () => new Date(Date.now() - 60000).toISOString(),
    row = (status, index) => ({
      id: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      taskId: `migration-task-${index}`,
      taskName,
      workerHostname: workerName,
      status,
      runtime: status === "1" ? null : 1.234,
      retries: status === "5" ? 2 : 0,
      startedAt: status === "1" ? null : stamp(),
      finishedAt: ["3", "4", "6"].includes(status) ? stamp() : null,
      createTime: stamp(),
      updateTime: stamp(),
    })
  const state = {
    rows: ["1", "2", "3", "4", "5", "6"].map((status, index) => row(status, index + 1)),
    empty: false,
    failList: false,
    failGroups: false,
    failDetail: false,
    failRegistered: false,
    failWrite: false,
    gate: null,
    writeGate: null,
    queries: [],
    groups: [],
    details: [],
    registrations: 0,
    writes: [],
    revokeSuccess: true,
  }
  async function handler(route) {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname.replace(/^\/(?:api\/v1|proxy-default)/, ""),
      query = Object.fromEntries(url.searchParams),
      method = request.method(),
      reply = (data, failed = false) =>
        route.fulfill({ json: failed ? { code: 422, message: "Task fixture failure", data: null } : { code: 0, data } })
    if (method === "GET") {
      if (path === "/tasks") {
        state.queries.push(query)
        if (state.gate) await state.gate
        const rows = state.empty
          ? []
          : state.rows.filter(
              (row) =>
                (!query.taskName ||
                  (query.taskNameMatch === "exact"
                    ? row.taskName === query.taskName
                    : row.taskName.includes(query.taskName))) &&
                (!query.workerHostname || row.workerHostname.includes(query.workerHostname)) &&
                (!query.status || query.status === row.status),
            )
        const page = Number(query.page || 1),
          pageSize = Number(query.pageSize || 20)
        return reply(
          {
            records:
              page === 1
                ? rows
                : rows.map((row) => ({ ...row, id: `${row.id}-page-${page}`, taskId: `${row.taskId}-page-${page}` })),
            total: state.empty ? 0 : 60,
            page,
            pageSize,
          },
          state.failList,
        )
      }
      if (path === "/tasks/stats/by-name") {
        state.groups.push(query)
        if (state.gate) await state.gate
        return reply(
          {
            records: state.empty
              ? []
              : [
                  {
                    taskName,
                    total: 6,
                    success: 1,
                    failure: 1,
                    inProgress: 2,
                    successRate: 50,
                    lastExecutedAt: stamp(),
                    avgRuntime: 1.234,
                  },
                ],
            total: state.empty ? 0 : 60,
            page: Number(query.page || 1),
            pageSize: Number(query.pageSize || 20),
          },
          state.failGroups,
        )
      }
      if (path === "/tasks/registered") {
        state.registrations++
        return reply({ tasks: [taskName, "migration.tasks.other"] }, state.failRegistered)
      }
      const match = path.match(/^\/tasks\/([^/]+)$/)
      if (match) {
        const id = decodeURIComponent(match[1])
        state.details.push(id)
        const item = state.rows.find((row) => row.taskId === id) || row("4", 4)
        return reply(
          {
            ...item,
            taskId: id,
            args: [null, true, 7, 1.25, "<b>literal</b>", ["nested", false], { nested: { deep: 2 } }],
            kwargs: { option: { enabled: true }, "not-valid": null },
            result: item.status === "3" ? { ok: true, content: "<script>literal</script>" } : null,
            exception: item.status === "4" ? "ValueError: <script>failed</script>" : null,
            traceback:
              item.status === "4" ? "Traceback (most recent call last):\n  example.py:12\nValueError: failed" : null,
            logs: "start\r\n\nfinished\n",
          },
          state.failDetail,
        )
      }
    }
    if (method === "POST") {
      const body = request.postDataJSON()
      state.writes.push({ path, body })
      if (state.writeGate) await state.writeGate
      if (path === "/tasks/trigger") {
        assert.equal(body.taskName, taskName)
        return reply({ taskId: "migration-submitted" }, state.failWrite)
      }
      const match = path.match(/^\/tasks\/([^/]+)\/revoke$/)
      if (match) {
        if (!state.failWrite && state.revokeSuccess)
          state.rows = state.rows.map((row) =>
            row.taskId === decodeURIComponent(match[1]) ? { ...row, status: "6" } : row,
          )
        return reply(state.revokeSuccess, state.failWrite)
      }
    }
    throw new Error(`Unexpected task request ${method} ${path}`)
  }
  return { state, handler }
}
