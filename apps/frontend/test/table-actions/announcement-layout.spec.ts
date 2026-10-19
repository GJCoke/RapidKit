import { expect, it, vi } from "vitest"
import { createAnnouncementActionModel } from "@/views/notification/manage/announcements/modules/announcement-table"
import { operationWidth, residentActionModel } from "@/hooks/business/table-actions/layout"
import { resolveLayouts, resolveRow } from "@/hooks/business/table-actions/resolve"
import { context } from "./fixtures"

vi.mock("@/locales", () => ({ $t: (key: string) => key.split(".").at(-1) }))

it("keeps only detail without write permissions and counts any menu as one entry", () => {
  const model = createAnnouncementActionModel()
  expect(resolveLayouts(model, context()).every((layout) => layout.length === 1)).toBe(true)
  const ctx = context(["notification:create", "notification:update", "notification:publish", "notification:delete"])
  const layouts = resolveLayouts(model, ctx)
  expect(layouts.every((layout) => layout.length === 2)).toBe(true)
  const multiple = operationWidth(layouts)
  expect(multiple).toBe(operationWidth(resolveLayouts(model, context(["notification:create"]))))
})

it("explicitly retains resident entries even with no button permissions", () => {
  const model = residentActionModel<object>({ detail: "详情" })
  expect(resolveRow(model, context(), {}).map((entry) => entry.actions)).toEqual([["detail"]])
  expect(operationWidth(resolveLayouts(model, { ...context(), ready: false }))).toBe(0)
})
