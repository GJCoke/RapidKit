// @vitest-environment jsdom
import assert from "node:assert/strict"
import { act, renderHook } from "@testing-library/react"
import { test } from "vitest"
import { useTableOperate } from "@/shared/data-table/use-table-operate"

test("table operation state opens add/edit and resets its editing snapshot", () => {
  const { result } = renderHook(() => useTableOperate<{ id: string; name: string }>((row) => row.id))

  act(() => result.current.openAdd())
  assert.equal(result.current.operation, "add")
  act(() => result.current.openEdit({ id: "1", name: "Ada" }))
  assert.deepEqual(result.current.editingRecord, { id: "1", name: "Ada" })
  act(() => result.current.close())
  assert.equal(result.current.open, false)
  assert.equal(result.current.editingRecord, null)
})

test("successful mutations clear selection", () => {
  const { result } = renderHook(() => useTableOperate<{ id: string }>((row) => row.id))
  act(() => result.current.setSelectedIds(["1", "2"]))
  act(() => result.current.completeMutation())
  assert.deepEqual(result.current.selectedIds, [])
})
