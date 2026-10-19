import { expect, it, vi } from "vitest"
import { createPackageActionModel } from "@/views/manage/permission-package/modules/package-actions"
import { resolveLayouts, resolveRow } from "@/hooks/business/table-actions/resolve"
import { operationWidth } from "@/hooks/business/table-actions/layout"
import { context } from "./fixtures"
vi.mock("@/locales", () => ({ $t: () => "操作" }))

it("uses detail as a read-only fallback and never edits a built-in package", () => {
  const model = createPackageActionModel<{ builtin: boolean }>()
  expect(resolveRow(model, context(), { builtin: false }).flatMap((entry) => entry.actions)).toEqual(["detail"])
  const ctx = context(["permission-package:update", "permission-package:delete"])
  expect(resolveRow(model, ctx, { builtin: false }).flatMap((entry) => entry.actions)).toEqual(["edit", "delete"])
  expect(resolveRow(model, ctx, { builtin: true }).flatMap((entry) => entry.actions)).toEqual(["detail"])
  expect(operationWidth(resolveLayouts(model, ctx))).toBe(132)
})
