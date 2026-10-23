import assert from "node:assert/strict"
export const schedulePattern = /\/(?:api\/v1|proxy-default)\/(?:schedules(?:\?|\/|$)|tasks\/registered(?:\?|$))/
export const taskName = "migration.tasks.scheduled"
export function scheduleFixtures() {
  const id = (n) => `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    values = [
      { type: "interval", every: 60, period: "seconds" },
      { type: "crontab", minute: "00", hour: "09", dayOfMonth: "*", monthOfYear: "jan", dayOfWeek: "mon-fri" },
      { type: "solar", event: "sunrise", latitude: 31.23041234, longitude: 121.47371234 },
    ],
    state = {
      rows: values.map((schedule, i) => ({
        id: id(i + 1),
        name: `Migration schedule ${i + 1}`,
        task: taskName,
        description: `Fixture ${i + 1}`,
        enabled: i !== 1,
        schedule,
        args: ["original"],
        kwargs: { flag: true },
      })),
      queries: [],
      previews: [],
      writes: [],
      registrations: 0,
      details: [],
      detailOverrides: {},
      empty: false,
      failList: false,
      failDetail: false,
      failRegistered: false,
      failPreview: false,
      failWrite: false,
      gate: null,
      previewGate: null,
      writeGate: null,
    }
  async function handler(route) {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname.replace(/^\/(?:api\/v1|proxy-default)/, ""),
      method = request.method(),
      query = Object.fromEntries(url.searchParams),
      reply = (data, fail = false) =>
        route.fulfill({
          json: fail ? { code: 422, message: "Schedule fixture failure", data: null } : { code: 0, data },
        })
    if (method === "GET") {
      if (path === "/tasks/registered") {
        state.registrations++
        return reply({ tasks: [taskName, "migration.tasks.other"] }, state.failRegistered)
      }
      if (path === "/schedules") {
        state.queries.push(query)
        if (state.gate) await state.gate
        const rows = state.empty
          ? []
          : state.rows.filter(
              (row) =>
                (!query.taskName || row.task.includes(query.taskName)) &&
                (query.enabled === undefined || row.enabled === (query.enabled === "true")),
            )
        return reply(
          {
            records: rows.map(({ args, kwargs, ...row }) => row),
            total: state.empty ? 0 : 61,
            page: Number(query.page || 1),
            pageSize: Number(query.pageSize || 20),
          },
          state.failList,
        )
      }
      const row = state.rows.find((row) => row.id === path.split("/").at(-1))
      assert(row, `unknown schedule ${path}`)
      state.details.push(row.id)
      return reply({ ...row, ...state.detailOverrides[row.id] }, state.failDetail)
    }
    if (path === "/schedules/preview") {
      const body = request.postDataJSON()
      assert(body.schedule)
      state.previews.push(body.schedule)
      if (state.previewGate) await state.previewGate
      const valid = body.schedule.type !== "crontab" || body.schedule.minute !== "99"
      return reply(
        {
          valid,
          errorField: valid ? null : "minute",
          timezone: "America/New_York",
          evaluatedAt: "2026-11-01T01:00:00.123456-04:00",
          nextRuns: valid
            ? [
                "2026-11-01T01:30:00.123456-04:00",
                "2026-11-01T01:30:00.123456-05:00",
                "2026-11-02T01:30:00.123456-05:00",
                "2026-11-03T01:30:00.123456-05:00",
                "2026-11-04T01:30:00.123456-05:00",
              ]
            : [],
          horizonYears: 5,
        },
        state.failPreview,
      )
    }
    const body = ["POST", "PUT"].includes(method) ? request.postDataJSON() : undefined
    state.writes.push({ path, method, body })
    if (state.writeGate) await state.writeGate
    if (state.failWrite) return reply(null, true)
    if (path === "/schedules" && method === "POST") {
      const row = { ...body, id: id(state.rows.length + 1) }
      state.rows.push(row)
      return reply(row)
    }
    const row = state.rows.find((row) => row.id === path.split("/")[2])
    assert(row)
    if (method === "PATCH") {
      assert.equal(request.postData(), null)
      row.enabled = !row.enabled
      return reply(row)
    }
    if (method === "PUT") {
      Object.assign(row, body)
      return reply(row)
    }
    assert.equal(method, "DELETE")
    state.rows = state.rows.filter((value) => value.id !== row.id)
    return reply(true)
  }
  return { state, handler }
}
