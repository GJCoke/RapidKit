import { expect, it, vi } from "vitest"
import { operationWidth } from "@/hooks/business/table-actions/layout"
import { resolveLayouts, resolveRow } from "@/hooks/business/table-actions/resolve"
import { createUserActionModel } from "@/views/manage/user/composables/user-actions"
import { context } from "./fixtures"

vi.mock("@/locales", () => ({ $t: (key: string) => key }))

function user(status: Api.SystemManage.UserStatus = "1"): Api.SystemManage.User {
  return {
    id: "target",
    username: "target",
    name: "Target",
    email: "target@example.test",
    roles: [],
    isAdmin: false,
    status,
    createTime: "2026-10-19",
    updateTime: "2026-10-19",
  }
}

it("removes the column without actions and renders invitation actions from the same permission", () => {
  const model = createUserActionModel()
  expect(operationWidth(resolveLayouts(model, context()))).toBe(0)
  const ctx = context(["user:update"])
  expect(resolveRow(model, ctx, user()).flatMap((entry) => entry.actions)).toEqual(["edit"])
  expect(resolveRow(model, ctx, user("3")).flatMap((entry) => entry.actions)).toEqual(["edit", "resend"])
})

it("keeps administrator permission bypass separate from impersonation restrictions", () => {
  const model = createUserActionModel()
  const ctx = { ...context(), isAdmin: true, hasAuth: () => true }
  expect(resolveRow(model, ctx, user()).flatMap((entry) => entry.actions)).toContain("impersonate")
  expect(resolveRow(model, { ...ctx, impersonating: true }, user()).flatMap((entry) => entry.actions)).not.toContain(
    "impersonate",
  )
  expect(resolveRow(model, ctx, user("3")).flatMap((entry) => entry.actions)).not.toContain("impersonate")
})

it("keeps edit visible and groups account actions into one compact menu", () => {
  const entries = resolveRow(createUserActionModel(), { ...context(), isAdmin: true, hasAuth: () => true }, user())
  expect(entries.map((entry) => [entry.kind, entry.actions])).toEqual([
    ["action", ["edit"]],
    ["menu", ["impersonate", "password", "delete"]],
  ])
})

it.each([false, true])(
  "does not reserve both self-password and another user's invitation (impersonating=%s)",
  (impersonating) => {
    const model = createUserActionModel()
    const ctx = { ...context(["user:update", "user:reset-password", "user:delete"]), impersonating }
    const self = { ...user(), id: ctx.actorId }
    const invited = user("3")
    const rows = [self, user(), invited]
    expect(resolveRow(model, ctx, self).flatMap((entry) => entry.actions)).toEqual(["edit", "password", "delete"])
    expect(resolveRow(model, ctx, invited).flatMap((entry) => entry.actions)).toEqual(["edit", "resend", "delete"])
    expect(operationWidth(resolveLayouts(model, ctx))).toBe(
      operationWidth(rows.map((row) => resolveRow(model, ctx, row))),
    )
  },
)

it("continues reserving both password and invitation actions for administrators", () => {
  const model = createUserActionModel()
  const ctx = { ...context(), isAdmin: true, hasAuth: () => true }
  expect(resolveRow(model, ctx, user("3")).flatMap((entry) => entry.actions)).toEqual([
    "edit",
    "password",
    "resend",
    "delete",
  ])
  expect(operationWidth(resolveLayouts(model, ctx))).toBe(
    operationWidth([resolveRow(model, ctx, user()), resolveRow(model, ctx, user("3"))]),
  )
})
