import assert from "node:assert/strict"
import type { ColumnPinningState } from "@tanstack/react-table"
import { test } from "vitest"
import { cycleColumnPinning, moveColumn, nextPageAfterDelete, reconcileColumnOrder } from "@/shared/data-table/table-state"

test("column pinning cycles from unpinned to left, right, then unpinned", () => {
  let state: ColumnPinningState = { left: [], right: [] }
  state = cycleColumnPinning(state, "email")
  assert.deepEqual(state, { left: ["email"], right: [] })
  state = cycleColumnPinning(state, "email")
  assert.deepEqual(state, { left: [], right: ["email"] })
  state = cycleColumnPinning(state, "email")
  assert.deepEqual(state, { left: [], right: [] })
})

test("column order keeps configured columns and appends newly introduced columns", () => {
  assert.deepEqual(reconcileColumnOrder(["name", "email", "removed"], ["select", "name", "email", "status"]), [
    "name",
    "email",
    "select",
    "status",
  ])
})

test("deleting the final record on a page falls back one page", () => {
  assert.equal(nextPageAfterDelete({ page: 3, remainingRecords: 0 }), 2)
  assert.equal(nextPageAfterDelete({ page: 1, remainingRecords: 0 }), 1)
  assert.equal(nextPageAfterDelete({ page: 3, remainingRecords: 2 }), 3)
})

test("column movement preserves every column exactly once", () => {
  assert.deepEqual(moveColumn(["select", "name", "email", "actions"], "email", "name"), [
    "select",
    "email",
    "name",
    "actions",
  ])
})
