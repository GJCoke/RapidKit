import type { ColumnOrderState, ColumnPinningState } from "@tanstack/react-table"

export function reconcileColumnOrder(current: ColumnOrderState, available: string[]): ColumnOrderState {
  const availableSet = new Set(available)
  const retained = current.filter((id) => availableSet.has(id))
  const retainedSet = new Set(retained)
  return [...retained, ...available.filter((id) => !retainedSet.has(id))]
}

export function cycleColumnPinning(state: ColumnPinningState, columnId: string): ColumnPinningState {
  const left = (state.left ?? []).filter((id) => id !== columnId)
  const right = (state.right ?? []).filter((id) => id !== columnId)
  if (state.left?.includes(columnId)) return { left, right: [...right, columnId] }
  if (state.right?.includes(columnId)) return { left, right }
  return { left: [...left, columnId], right }
}

export function nextPageAfterDelete({ page, remainingRecords }: { page: number; remainingRecords: number }) {
  return remainingRecords === 0 && page > 1 ? page - 1 : page
}

export function moveColumn(order: string[], activeId: string, overId: string) {
  const from = order.indexOf(activeId)
  const to = order.indexOf(overId)
  if (from < 0 || to < 0 || from === to) return order
  const next = [...order]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}
