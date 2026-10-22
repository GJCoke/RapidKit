import { describe, expect, it } from "vitest"
import { canExecute, resolveRow, resolveLayouts, permits } from "@/hooks/business/table-actions/resolve"
import { context, model } from "./fixtures"

describe("action resolution", () => {
  it("keeps a resident action and removes an empty menu", () => {
    const result = resolveRow(model, context(), { builtin: false, active: true })
    expect(result.map((entry) => entry.actions)).toEqual([["detail"]])
  })
  it("selects one exclusive entry and counts more as one entry", () => {
    const ctx = context(["user:update", "user:delete"])
    const result = resolveRow(model, ctx, { builtin: false, active: true })
    expect(result.map((entry) => entry.actions)).toEqual([["edit"], ["delete"]])
    expect(result).toHaveLength(2)
  })
  it("retains a disabled menu item but prevents execution", () => {
    const ctx = context(["user:delete"])
    const row = { builtin: false, active: false }
    expect(resolveRow(model, ctx, row)).toHaveLength(2)
    expect(canExecute(model, ctx, row, "delete")).toBe(false)
  })
  it("denies unresolved authentication and empty permission requirements", () => {
    expect(resolveLayouts(model, { ...context(), ready: false })).toEqual([])
    expect(permits({ kind: "all", codes: [] }, context())).toBe(false)
    expect(permits({ kind: "any", codes: [] }, context())).toBe(false)
  })
  it("distinguishes any-of from all-of", () => {
    const ctx = context(["user:update"])
    expect(permits({ kind: "any", codes: ["user:update", "user:delete"] }, ctx)).toBe(true)
    expect(permits({ kind: "all", codes: ["user:update", "user:delete"] }, ctx)).toBe(false)
  })
})

it("rejects unknown actions, duplicate definitions and invalid width budgets", () => {
  expect(() =>
    resolveLayouts(
      { ...model, layouts: [{ key: "bad", matches: () => true, entries: [{ kind: "action", key: "unknown" }] }] },
      context(),
    ),
  ).toThrow("Unknown action")
  expect(() => resolveLayouts({ ...model, actions: [...model.actions, model.actions[0]] }, context())).toThrow(
    "Duplicate action",
  )
  expect(() =>
    resolveLayouts({ ...model, actions: model.actions.map((action) => ({ ...action, width: Number.NaN })) }, context()),
  ).toThrow("positive finite")
})

it("budgets only reachable choice alternatives and still reserves a row-dependent fallback", () => {
  const choices = {
    ...model,
    layouts: [
      {
        key: "choice",
        matches: () => true,
        entries: [{ kind: "choice" as const, key: "primary", actions: ["edit", "detail"] }],
      },
    ],
    actions: model.actions.map((action) => ({ ...action, width: action.key === "detail" ? 120 : 56 })),
  }
  const ctx = context(["user:update"])
  expect(resolveLayouts(choices, ctx)[0][0].width).toBe(56)
  const conditional = {
    ...choices,
    actions: choices.actions.map((action) =>
      action.key === "edit" ? { ...action, visible: (row: { active: boolean }) => row.active } : action,
    ),
  }
  expect(resolveLayouts(conditional, ctx)[0][0].width).toBe(120)
  expect(resolveRow(conditional, ctx, { builtin: false, active: false })[0].actions).toEqual(["detail"])
})
