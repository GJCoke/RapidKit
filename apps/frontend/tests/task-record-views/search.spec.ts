import { describe, expect, it } from "vitest"
import { readTaskView } from "../../src/views/queue/task/composables/task-view-state"
import { applyTaskSearch, resetTaskSearch } from "../../src/views/queue/task/composables/task-search"

describe("explicit task search", () => {
  it("keeps input edits separate until search and resets pagination when applied", () => {
    const active = readTaskView({ view: "groups", groupPage: "4", task: "tasks.sync" }, Date.UTC(2026, 9, 8))
    const draft = { ...active, keyword: "report", worker: "worker2", status: "4" as const, sortBy: "failure" as const }
    expect(active.keyword).toBe("")
    expect(active.page).toBe(4)
    const result = applyTaskSearch(active, draft, Date.UTC(2026, 9, 9))
    expect(result).toMatchObject({
      keyword: "report",
      worker: "worker2",
      status: "4",
      sortBy: "failure",
      page: 1,
      task: "tasks.sync",
      view: "groups",
    })
    expect(result.end).toBe("2026-10-09T00:00:00.000Z")
  })
  it("preserves custom bounds on search and clears exact task and pagination on reset", () => {
    const active = readTaskView(
      {
        range: "custom",
        startTime: "2026-10-01T00:00:00.000Z",
        endTime: "2026-10-02T00:00:00.000Z",
        keyword: "sync",
        task: "tasks.sync",
        groupPage: "4",
      },
      Date.UTC(2026, 9, 8),
    )
    expect(applyTaskSearch(active, { ...active })).toMatchObject({ start: active.start, end: active.end })
    const reset = resetTaskSearch(active, Date.UTC(2026, 9, 8))
    expect(reset).toMatchObject({ keyword: "", worker: "", status: undefined, preset: "7d", task: "", page: 1 })
    expect(active.keyword).toBe("sync")
    expect(active.preset).toBe("custom")
  })
})
