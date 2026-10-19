import { describe, expect, it } from "vitest"
import {
  drillTask,
  readTaskView,
  refreshTaskRange,
  timeRange,
  validRange,
  writeTaskView,
} from "../../src/views/queue/task/composables/task-view-state"

describe("task view navigation", () => {
  it("defaults to records with a concrete seven day UTC range", () => {
    const state = readTaskView({}, Date.UTC(2026, 9, 8))
    expect(state.view).toBe("records")
    expect(state.pageSize).toBe(20)
    expect(Date.parse(state.end) - Date.parse(state.start)).toBe(7 * 86400000)
    expect(state.start.endsWith("Z")).toBe(true)
  })
  it("round trips summary search, page and sorting through URL", () => {
    const state = readTaskView({
      view: "groups",
      keyword: "jobs.%_",
      worker: "worker-1",
      groupPage: "3",
      sortBy: "failure",
    })
    expect(readTaskView(writeTaskView(state))).toEqual(state)
  })
  it("restores supported page sizes and replaces legacy or invalid sizes with 20", () => {
    for (const size of [20, 50, 100, 500]) {
      const state = readTaskView({ groupSize: String(size) })
      expect(state.pageSize).toBe(size)
      expect(readTaskView(writeTaskView(state)).pageSize).toBe(size)
    }
    for (const groupSize of ["10", "15", "0", "501", "Infinity", "20.5", "invalid"]) {
      expect(readTaskView({ groupSize }).pageSize).toBe(20)
    }
  })
  it("drills into exact task while retaining summary pagination and interval", () => {
    const summary = readTaskView({ view: "groups", groupPage: "4", keyword: "jobs" })
    const records = drillTask(summary, "jobs.cleanup", true)
    expect(records).toMatchObject({
      view: "records",
      task: "jobs.cleanup",
      status: "4",
      page: 4,
      start: summary.start,
      end: summary.end,
      keyword: "jobs",
    })
    expect(drillTask(summary, "jobs.cleanup").status).toBeUndefined()
  })
  it("rejects empty, reversed and oversized intervals", () => {
    const { start, end } = timeRange("7d")
    expect(validRange(start, end)).toBe(true)
    expect(validRange(end, start)).toBe(false)
    expect(validRange(start, start)).toBe(false)
    expect(validRange("2026-01-01", "2026-05-01")).toBe(false)
  })
})

it("rolls preset refresh intervals while keeping custom intervals fixed", () => {
  const initial = readTaskView({}, 1000000000)
  expect(refreshTaskRange(initial, 2000000000).end).toBe(new Date(2000000000).toISOString())
  initial.preset = "custom"
  expect(refreshTaskRange(initial, 2000000000)).toBe(initial)
  for (const groupPage of ["Infinity", "1.5", "-1"]) expect(readTaskView({ groupPage }).page).toBe(1)
})
