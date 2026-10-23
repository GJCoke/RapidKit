import { expect, test } from "vitest"
import {
  readTaskView,
  writeTaskView,
  timeRange,
  validRange,
  applyTaskSearch,
  resetTaskSearch,
  drillTask,
  taskRecordQuery,
  taskGroupQuery,
} from "@/views/queue/task/modules/task-view-state"
const now = Date.parse("2026-10-24T00:00:00Z")
test("records default to seven days and source page sizes; malformed URL values fall back safely", () => {
  const state = readTaskView(
    new URLSearchParams("view=bad&range=bad&status=7&groupPage=-1&groupSize=10&sortBy=bad"),
    now,
  )
  expect(state).toEqual({
    view: "records",
    task: "",
    keyword: "",
    worker: "",
    status: undefined,
    preset: "7d",
    start: "2026-10-17T00:00:00.000Z",
    end: "2026-10-24T00:00:00.000Z",
    page: 1,
    pageSize: 20,
    sortBy: "lastExecutedAt",
    sortOrder: "desc",
  })
  expect(
    readTaskView(new URLSearchParams("view=groups&groupSize=500&groupPage=3&sortBy=failure&sortOrder=asc"), now),
  ).toMatchObject({ view: "groups", pageSize: 500, page: 3, sortBy: "failure", sortOrder: "asc" })
})
test("owned URL state round-trips without destroying unrelated query values or reviving cleared filters", () => {
  const query = new URLSearchParams(
    "view=records&task=sample.job&worker=worker%40one&status=4&range=custom&startTime=2026-10-01T00%3A00%3A00Z&endTime=2026-10-02T00%3A00%3A00Z&debug=1",
  )
  const state = readTaskView(query, now),
    written = writeTaskView({ ...state, task: "", worker: "", status: undefined }, query)
  expect(written.get("debug")).toBe("1")
  expect(written.has("task")).toBe(false)
  expect(written.has("worker")).toBe(false)
  expect(written.has("status")).toBe(false)
  expect(readTaskView(writeTaskView(state, query), now)).toEqual(state)
})
test("custom intervals are positive and at most 90 days, and explicit DST offsets remain distinct instants", () => {
  expect(validRange("2026-10-01T00:00:00Z", "2026-10-01T00:00:00Z")).toBe(false)
  expect(validRange("2026-10-01T00:00:00Z", "2026-09-30T00:00:00Z")).toBe(false)
  expect(validRange("2026-01-01T00:00:00Z", "2026-04-01T00:00:00Z")).toBe(true)
  expect(validRange("2026-01-01T00:00:00Z", "2026-04-01T00:00:00.001Z")).toBe(false)
  expect(validRange("bad", "bad")).toBe(false)
  expect(validRange("2026-11-01T01:30:00-04:00", "2026-11-01T01:30:00-05:00")).toBe(true)
  const state = readTaskView(
    new URLSearchParams("range=custom&startTime=2026-11-01T01:30:00-04:00&endTime=2026-11-01T01:30:00-05:00"),
    now,
  )
  expect(Date.parse(state.end) - Date.parse(state.start)).toBe(3600000)
})
test("search applies a draft atomically, renews presets and resets group pages while keeping exact drill context", () => {
  const active = { ...readTaskView(new URLSearchParams(), now), page: 4, task: "sample.exact" },
    draft = { ...active, keyword: "new", worker: "worker@new", preset: "24h" as const, status: "2" as const }
  expect(applyTaskSearch(active, draft, now + 1000)).toMatchObject({
    task: "sample.exact",
    keyword: "new",
    worker: "worker@new",
    status: "2",
    page: 1,
    start: timeRange("24h", now + 1000).start,
    end: timeRange("24h", now + 1000).end,
  })
  expect(drillTask(active, "other", true)).toMatchObject({ view: "records", task: "other", status: "4", page: 4 })
  expect(drillTask(active, "other", false).status).toBeUndefined()
  expect(resetTaskSearch(active, now)).toMatchObject({
    task: "",
    keyword: "",
    worker: "",
    status: undefined,
    preset: "7d",
    page: 1,
    sortBy: "lastExecutedAt",
    sortOrder: "desc",
  })
})
test("record queries distinguish exact task drills from contains searches and groups ignore record-only status", () => {
  const state = {
    ...readTaskView(new URLSearchParams(), now),
    task: "job.exact",
    keyword: "partial",
    worker: "worker@one",
    status: "4" as const,
    page: 3,
    pageSize: 100,
  }
  expect(taskRecordQuery(state, { page: 2, pageSize: 50 })).toEqual({
    page: 2,
    pageSize: 50,
    taskName: "job.exact",
    taskNameMatch: "exact",
    workerHostname: "worker@one",
    status: "4",
    startTime: state.start,
    endTime: state.end,
  })
  expect(taskRecordQuery({ ...state, task: "" }, { page: 1, pageSize: 20 })).toMatchObject({
    taskName: "partial",
    taskNameMatch: "contains",
  })
  expect(taskGroupQuery(state)).toEqual({
    page: 3,
    pageSize: 100,
    taskName: "partial",
    workerHostname: "worker@one",
    startTime: state.start,
    endTime: state.end,
    sortBy: "lastExecutedAt",
    sortOrder: "desc",
  })
})
