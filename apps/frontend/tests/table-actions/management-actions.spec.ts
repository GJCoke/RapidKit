import { expect, it, vi } from "vitest"
import { resolveRow } from "@/hooks/business/table-actions/resolve"
import { createRoleActionModel } from "@/views/manage/role/modules/table-actions"
import { createMenuActionModel } from "@/views/manage/menu/modules/table-actions"
import { createScheduleActionModel } from "@/views/queue/schedule/modules/table-actions"
import { context } from "./fixtures"

vi.mock("@/locales", () => ({ $t: (key: string) => key }))

it.each([
  {
    name: "role",
    model: createRoleActionModel<object>(),
    codes: ["role:grant", "role:update", "role:delete"] as PermissionCode[],
  },
  {
    name: "menu",
    model: createMenuActionModel<object>(),
    codes: ["menu:create", "menu:update", "menu:delete"] as PermissionCode[],
  },
  {
    name: "schedule",
    model: createScheduleActionModel<object>(),
    codes: ["schedule:update", "schedule:delete"] as PermissionCode[],
  },
])("resolves only allowed $name entries", ({ model, codes }) => {
  expect(resolveRow(model, context(), {})).toEqual([])
  expect(resolveRow(model, context([codes[0]]), {})).toHaveLength(1)
  expect(resolveRow(model, context(codes), {})).toHaveLength(codes.length)
})
