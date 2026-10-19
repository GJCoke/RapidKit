import { afterEach, expect, it, vi } from "vitest"
import { textButtonWidth } from "@/hooks/business/table-actions/layout"
import { useTableActions } from "@/hooks/business/table-actions/use-table-actions"
import { context, model } from "./fixtures"

afterEach(() => vi.unstubAllGlobals())

function browserTextMetrics(widths: Record<string, number>) {
  const context = { font: "", measureText: (text: string) => ({ width: widths[text] }) }
  vi.stubGlobal("document", {
    body: {},
    createElement: () => ({ getContext: () => context }),
    defaultView: { getComputedStyle: () => ({ fontFamily: "system-ui" }) },
  })
  return context
}

it("sizes English buttons from glyph widths rather than a fixed width per character", () => {
  browserTextMetrics({ iiii: 16, WWWW: 52, Edit: 24.83, Delete: 42.22, "Apply Packages": 97.16 })
  expect(textButtonWidth("iiii")).toBeLessThan(textButtonWidth("WWWW"))
  expect(textButtonWidth("Edit")).toBeLessThanOrEqual(47)
  expect(textButtonWidth("Delete")).toBeLessThanOrEqual(65)
  expect(textButtonWidth("Apply Packages")).toBeLessThanOrEqual(120)
})

it("measures with the application font and reserves padding and icon space", () => {
  const context = browserTextMetrics({ More: 32 })
  const plain = textButtonWidth("More")
  expect(context.font).toContain("14px system-ui")
  expect(plain).toBeGreaterThanOrEqual(52)
  expect(textButtonWidth("More", 18)).toBe(plain + 24)
})

it("keeps a translated operation header readable when only a short action remains", () => {
  browserTextMetrics({ Operations: 80 })
  const actions = useTableActions(
    () => model,
    () => context(),
  )
  const column = actions.column({ key: "operate", title: "Operations" })[0]
  expect(column.width).toBeGreaterThanOrEqual(104)
  expect(column.minWidth).toBe(column.width)
  expect(column.maxWidth).toBe(column.width)
})
