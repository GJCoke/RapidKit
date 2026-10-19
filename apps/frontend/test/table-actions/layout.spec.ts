import { expect, it } from "vitest"
import { operationWidth, textButtonWidth } from "@/hooks/business/table-actions/layout"
import { resolveLayouts } from "@/hooks/business/table-actions/resolve"
import { context, model } from "./fixtures"

it("has no column for no entries and respects the header minimum", () => {
  expect(operationWidth([])).toBe(0)
  expect(operationWidth([[{ key: "small", kind: "action", width: 10, actions: ["small"] }]])).toBe(64)
})

it("uses the widest legal layout and counts a menu once", () => {
  expect(operationWidth(resolveLayouts(model, context()))).toBe(80)
  expect(operationWidth(resolveLayouts(model, context(["user:update", "user:delete"])))).toBe(152)
})

it("budgets long English labels and reserved icons", () => {
  expect(textButtonWidth("Resend invitation")).toBeGreaterThan(textButtonWidth("编辑"))
  expect(textButtonWidth("编辑", 18)).toBeGreaterThan(textButtonWidth("编辑"))
})
