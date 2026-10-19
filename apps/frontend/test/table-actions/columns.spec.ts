import { expect, it } from "vitest"
import type { TableColumnCheck } from "@rapidkit/hooks"
import { createColumnCheckMemory, tableScrollWidth } from "@/hooks/common/table-columns"

function check(key: string): TableColumnCheck {
  return { key, title: key, checked: true, visible: true, fixed: "unFixed" }
}

it("preserves order, hidden preference, and pinning after permission removal", () => {
  const memory = createColumnCheckMemory()
  const defaults = [check("name"), check("operate")]
  const current = memory.reconcile([], defaults).reverse()
  current[0].fixed = "right"
  current[1].checked = false
  const removed = memory.reconcile(current, [check("name")])
  expect(removed.map((item) => item.key)).toEqual(["name"])
  expect(removed[0].checked).toBe(false)
  const restored = memory.reconcile(removed, defaults)
  expect(restored.map((item) => item.key)).toEqual(["operate", "name"])
  expect(restored[0].fixed).toBe("right")
  expect(restored[1].checked).toBe(false)
})

it("sums leaf widths without producing NaN for CSS units", () => {
  expect(
    tableScrollWidth([{ children: [{ width: "80px" }, { width: "20%", minWidth: 100 }] }, { width: "auto" }]),
  ).toBe(300)
})
