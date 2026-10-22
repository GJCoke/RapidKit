import { expect, it, vi } from "vitest"
import { createTaskActionModel } from "@/views/queue/task/modules/task-actions"
import { resolveLayouts, resolveRow } from "@/hooks/business/table-actions/resolve"
import { operationWidth } from "@/hooks/business/table-actions/layout"
import { context } from "./fixtures"
vi.mock("@/locales", () => ({ $t: (key: string) => key.split(".").at(-1) }))

it("keeps task detail while restricting revoke to running tasks", () => {
  const model = createTaskActionModel<{ status: string }>()
  expect(resolveRow(model, context(), { status: "1" }).flatMap((entry) => entry.actions)).toEqual(["detail"])
  const ctx = context(["task:revoke"])
  expect(resolveRow(model, ctx, { status: "1" }).flatMap((entry) => entry.actions)).toEqual(["detail", "revoke"])
  expect(resolveRow(model, ctx, { status: "3" }).flatMap((entry) => entry.actions)).toEqual(["detail"])
  expect(operationWidth(resolveLayouts(model, ctx))).toBeGreaterThan(operationWidth(resolveLayouts(model, context())))
})
