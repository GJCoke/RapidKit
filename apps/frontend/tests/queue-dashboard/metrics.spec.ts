import { describe, expect, it } from "vitest"
import { queueState, sortQueues, utilization } from "../../src/views/queue/dashboard/composables/metrics"

describe("queue overview semantics", () => {
  it("only flags missing consumers when there is work and preserves unknown depths", () => {
    expect(queueState({ depth: 0, consumers: 0 })).toBe("idle")
    expect(queueState({ depth: 4, consumers: 0 })).toBe("blocked")
    expect(queueState({ depth: null, consumers: 1 })).toBe("unknown")
    expect(queueState({ depth: 4, consumers: null })).toBe("unknown")
    expect(queueState({ depth: 4, consumers: 1 })).toBe("healthy")
  })
  it("puts blocked queues first and does not mutate API data", () => {
    const rows = [
      { name: "a", depth: 9, consumers: 1 },
      { name: "b", depth: 2, consumers: 0 },
    ]
    expect(sortQueues(rows).map((row) => row.name)).toEqual(["b", "a"])
    expect(rows[0].name).toBe("a")
  })
  it("does not invent available capacity", () => {
    expect(utilization(2, 0)).toBeNull()
    expect(utilization(3, 8)).toBe(37.5)
    expect(utilization(10, 8)).toBe(125)
  })
})
