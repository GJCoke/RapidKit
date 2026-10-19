import type { ActionDefinition, ActionModel, ResolvedEntry } from "./types"

export function operationWidth(
  layouts: readonly (readonly ResolvedEntry[])[],
  gap = 8,
  padding = 24,
  header = 64,
): number {
  const widths = layouts
    .filter((layout) => layout.length)
    .map((layout) => layout.reduce((sum, entry) => sum + entry.width, 0) + gap * (layout.length - 1) + padding)
  return widths.length ? Math.max(header, ...widths) : 0
}

let measurement: { document: Document; context: CanvasRenderingContext2D | null } | undefined

export function textButtonWidth(label: string, icon = 0, fontSize = 14, horizontalPadding = 20): number {
  let text: number | undefined
  if (typeof document !== "undefined") {
    if (measurement?.document !== document) {
      measurement = { document, context: document.createElement("canvas").getContext("2d") }
    }
    const context = measurement.context
    if (context) {
      const family = document.body && document.defaultView?.getComputedStyle(document.body).fontFamily
      context.font = `${fontSize}px ${family || "sans-serif"}`
      text = context.measureText(label).width
    }
  }
  // Keep a conservative fallback for SSR and environments without canvas metrics.
  text ??= [...label].reduce((sum, char) => sum + (char.charCodeAt(0) <= 0x7f ? fontSize * 0.8 : fontSize), 0)
  // NaiveUI small buttons use 10px horizontal padding; allow 2px for rounding.
  return Math.ceil(text + horizontalPadding + (icon ? icon + 6 : 0) + 2)
}

/** Explicit page-local actions; the enclosing route still controls access. */
export function residentActionModel<Row>(labels: Record<string, string>): ActionModel<Row> {
  const actions: ActionDefinition<Row>[] = Object.entries(labels).map(([key, label]) => ({
    key,
    access: { kind: "page" },
    width: textButtonWidth(label),
  }))
  return {
    actions,
    layouts: [{ key: "default", matches: () => true, entries: actions.map(({ key }) => ({ kind: "action", key })) }],
  }
}
