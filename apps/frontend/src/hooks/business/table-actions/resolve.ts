import type {
  ActionAccess,
  ActionContext,
  ActionDefinition,
  ActionEntry,
  ActionLayout,
  ActionModel,
  ResolvedEntry,
} from "./types"

export function permits(access: ActionAccess, context: ActionContext): boolean {
  if (!context.ready) return false
  if (access.kind === "page") return true
  if (access.kind === "predicate") return access.test(context)
  if (!access.codes.length) return false
  return access.kind === "all"
    ? access.codes.every((code) => context.hasAuth(code))
    : access.codes.some((code) => context.hasAuth(code))
}

export function readWidth(value: number | ((context: ActionContext) => number), context: ActionContext): number {
  const width = typeof value === "function" ? value(context) : value
  if (!Number.isFinite(width) || width <= 0) throw new Error("Action width must be a positive finite number")
  return width
}

function definitions<Row>(model: ActionModel<Row>): Map<string, ActionDefinition<Row>> {
  const result = new Map<string, ActionDefinition<Row>>()
  for (const action of model.actions) {
    if (result.has(action.key)) throw new Error(`Duplicate action: ${action.key}`)
    result.set(action.key, action)
  }
  return result
}

function entries<Row>(
  model: ActionModel<Row>,
  layout: ActionLayout<Row>,
  context: ActionContext,
  row?: Row,
): ResolvedEntry[] {
  const lookup = definitions(model)
  const get = (key: string) => {
    const action = lookup.get(key)
    if (!action) throw new Error(`Unknown action: ${key}`)
    return action
  }
  const allowed = (key: string) => {
    const action = get(key)
    return (
      permits(action.access, context) &&
      (action.available?.(context) ?? true) &&
      (row === undefined || (action.visible?.(row, context) ?? true))
    )
  }
  return layout.entries.flatMap((entry: ActionEntry): ResolvedEntry[] => {
    const keys = entry.kind === "action" ? [entry.key] : entry.actions
    const eligible = keys.filter(allowed)
    if (!eligible.length) return []
    let candidates = eligible
    if (entry.kind === "choice" && row === undefined) {
      const unconditional = eligible.findIndex((key) => !get(key).visible)
      if (unconditional >= 0) candidates = eligible.slice(0, unconditional + 1)
    }
    const actions = entry.kind === "choice" && row !== undefined ? eligible.slice(0, 1) : candidates
    const width =
      entry.kind === "menu"
        ? readWidth(entry.width, context)
        : Math.max(...actions.map((key) => readWidth(get(key).width, context)))
    return [{ key: entry.key, kind: entry.kind, width, actions: [...actions] }]
  })
}

export function resolveLayouts<Row>(model: ActionModel<Row>, context: ActionContext): ResolvedEntry[][] {
  if (!context.ready) return []
  return model.layouts
    .filter((layout) => layout.available?.(context) ?? true)
    .map((layout) => entries(model, layout, context))
    .filter((layout) => layout.length > 0)
}

export function resolveRow<Row>(model: ActionModel<Row>, context: ActionContext, row: Row): ResolvedEntry[] {
  if (!context.ready) return []
  const layout = model.layouts.find((item) => (item.available?.(context) ?? true) && item.matches(row, context))
  return layout ? entries(model, layout, context, row) : []
}

export function canExecute<Row>(model: ActionModel<Row>, context: ActionContext, row: Row, key: string): boolean {
  const action = definitions(model).get(key)
  return Boolean(
    action &&
    resolveRow(model, context, row).some((entry) => entry.actions.includes(key)) &&
    !(action.disabled?.(row, context) ?? false),
  )
}
