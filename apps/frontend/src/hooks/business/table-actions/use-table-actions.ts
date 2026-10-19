import { computed } from "vue"
import type { DataTableBaseColumn } from "naive-ui"
import type { ActionContext, ActionModel } from "./types"
import { operationWidth, textButtonWidth } from "./layout"
import { canExecute, resolveLayouts, resolveRow } from "./resolve"

type ActionColumn<Row> = Omit<DataTableBaseColumn<Row>, "key"> & { key: string }

export function useTableActions<Row>(
  getModel: () => ActionModel<Row>,
  getContext: () => ActionContext,
  getRowKey?: (row: Row) => unknown,
) {
  const model = computed(getModel)
  const context = computed(getContext)
  const layouts = computed(() => resolveLayouts(model.value, context.value))
  const width = computed(() => operationWidth(layouts.value))
  const shown = computed(() => width.value > 0)
  const rowEntries = (row: Row) => resolveRow(model.value, context.value, row)
  const visible = (row: Row, key: string) => rowEntries(row).some((entry) => entry.actions.includes(key))
  const enabled = (row: Row, key: string) => canExecute(model.value, context.value, row, key)
  const pending = new Map<unknown, Set<string>>()
  async function run(getRow: () => Row | undefined, key: string, execute: (row: Row) => unknown): Promise<boolean> {
    const row = getRow()
    if (row === undefined || !enabled(row, key)) return false
    const identity = getRowKey ? getRowKey(row) : row
    if (pending.get(identity)?.has(key)) return false
    const keys = pending.get(identity) ?? new Set<string>()
    keys.add(key)
    pending.set(identity, keys)
    try {
      return (await execute(row)) !== false
    } finally {
      keys.delete(key)
      if (!keys.size) pending.delete(identity)
    }
  }
  function column(config: Omit<ActionColumn<Row>, "width" | "minWidth" | "maxWidth">): ActionColumn<Row>[] {
    const columnWidth = Math.max(
      width.value,
      typeof config.title === "string" ? textButtonWidth(config.title, 0, 14, 24) : 0,
    )
    return shown.value
      ? [
          {
            align: "left",
            ...config,
            fixed: context.value.isMobile ? undefined : config.fixed,
            width: columnWidth,
            minWidth: columnWidth,
            maxWidth: columnWidth,
          },
        ]
      : []
  }
  return { width, shown, rowEntries, visible, enabled, run, column }
}
