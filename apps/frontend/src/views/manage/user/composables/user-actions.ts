import { canImpersonate } from "@/components/impersonation/eligibility"
import { $t } from "@/locales"
import { textButtonWidth } from "@/hooks/business/table-actions/layout"
import type { ActionEntry, ActionModel } from "@/hooks/business/table-actions/types"

export function createUserActionModel(): ActionModel<Api.SystemManage.User> {
  const action = (key: string): ActionEntry => ({ kind: "action", key })
  return {
    actions: [
      {
        key: "impersonate",
        access: { kind: "predicate", test: (ctx) => ctx.isAdmin && !ctx.impersonating },
        visible: (row, ctx) => canImpersonate({ id: ctx.actorId, isAdmin: ctx.isAdmin }, row, ctx.impersonating),
        width: () => textButtonWidth($t("page.manage.user.impersonation.start")),
      },
      { key: "edit", access: { kind: "all", codes: ["user:update"] }, width: () => textButtonWidth($t("common.edit")) },
      {
        key: "password",
        access: { kind: "all", codes: ["user:reset-password"] },
        visible: (row, ctx) => ctx.isAdmin || row.id === ctx.actorId,
        width: () => textButtonWidth($t("page.manage.user.changePassword")),
      },
      {
        key: "resend",
        access: { kind: "all", codes: ["user:update"] },
        visible: (row) => row.status === "3",
        width: () => textButtonWidth($t("page.manage.user.resendInvite")),
      },
      {
        key: "delete",
        access: { kind: "all", codes: ["user:delete"] },
        width: () => textButtonWidth($t("common.delete")),
      },
    ],
    layouts: [
      {
        key: "invited",
        available: (ctx) => ctx.isAdmin,
        matches: (row) => row.status === "3",
        entries: ["edit", "password", "resend", "delete"].map(action),
      },
      {
        key: "active",
        available: (ctx) => ctx.isAdmin,
        matches: (row) => row.status === "1",
        entries: ["impersonate", "edit", "password", "delete"].map(action),
      },
      {
        key: "other",
        available: (ctx) => ctx.isAdmin,
        matches: () => true,
        entries: ["edit", "password", "delete"].map(action),
      },
      {
        key: "member",
        available: (ctx) => !ctx.isAdmin,
        matches: () => true,
        // Members reset their own password or resend another user's invitation.
        // These controls cannot coexist on a reachable row for a signed-in member.
        entries: [
          action("edit"),
          { kind: "choice", key: "account", actions: ["password", "resend"] },
          action("delete"),
        ],
      },
    ],
  }
}
