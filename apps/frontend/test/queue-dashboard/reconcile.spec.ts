import { nextTick, reactive, watch } from "vue"
import { describe, expect, it } from "vitest"
import { reconcileRows } from "../../src/views/queue/dashboard/composables/reconcile"

describe("incremental rows", () => {
  it("preserves the collection and unchanged rows without triggering reactive updates", async () => {
    const rows = reactive([{ name: "celery", depth: 3, consumers: 1 }])
    const original = rows[0]
    let changes = 0
    const stop = watch(rows, () => changes++, { deep: true })
    reconcileRows(rows, [{ name: "celery", depth: 3, consumers: 1 }], (row) => row.name)
    await nextTick()
    expect(rows[0]).toBe(original)
    expect(changes).toBe(0)
    reconcileRows(rows, [{ name: "celery", depth: 5, consumers: 1 }], (row) => row.name)
    await nextTick()
    expect(rows[0]).toBe(original)
    expect(rows[0].depth).toBe(5)
    expect(changes).toBe(1)
    stop()
  })
  it("adds, removes and reorders only the requested keys", () => {
    const rows = [
      { name: "a", depth: 1 },
      { name: "b", depth: 2 },
    ]
    const b = rows[1]
    reconcileRows(
      rows,
      [
        { name: "b", depth: 3 },
        { name: "c", depth: 1 },
      ],
      (row) => row.name,
    )
    expect(rows.map((row) => row.name)).toEqual(["b", "c"])
    expect(rows[0]).toBe(b)
    expect(b.depth).toBe(3)
  })
})
