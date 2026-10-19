import type { TableColumnCheck } from "@rapidkit/hooks"

export function createColumnCheckMemory() {
  let order: string[] = []
  const preferences = new Map<string, Pick<TableColumnCheck, "checked" | "fixed">>()
  function reconcile(current: TableColumnCheck[], defaults: TableColumnCheck[]) {
    const currentKeys = current.map((item) => item.key)
    const knownCurrent = currentKeys.filter((key) => order.includes(key))
    const active = new Set(knownCurrent)
    let cursor = 0
    order = order.map((key) => (active.has(key) ? knownCurrent[cursor++] : key))
    for (const item of current) {
      preferences.set(item.key, { checked: item.checked, fixed: item.fixed })
      if (!order.includes(item.key)) order.push(item.key)
    }
    for (const item of defaults) if (!order.includes(item.key)) order.push(item.key)
    const available = new Map(defaults.map((item) => [item.key, item]))
    return order.flatMap((key) => {
      const item = available.get(key)
      return item ? [{ ...item, ...preferences.get(key) }] : []
    })
  }
  return { reconcile }
}

export interface WidthColumn {
  width?: number | string
  minWidth?: number | string
  children?: readonly WidthColumn[]
}

function numericWidth(value: number | string | undefined): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : undefined
  if (typeof value !== "string" || !/^\d+(?:\.\d+)?(?:px)?$/.test(value)) return undefined
  const parsed = Number.parseFloat(value)
  return parsed > 0 ? parsed : undefined
}

export function tableScrollWidth(columns: readonly WidthColumn[], fallback = 120): number {
  return columns.reduce(
    (sum, column) =>
      sum +
      (column.children
        ? tableScrollWidth(column.children, fallback)
        : (numericWidth(column.width) ?? numericWidth(column.minWidth) ?? fallback)),
    0,
  )
}
