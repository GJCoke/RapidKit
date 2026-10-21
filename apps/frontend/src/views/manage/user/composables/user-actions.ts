import { canImpersonate } from "@/components/impersonation/eligibility"
import { $t } from "@/locales"
import { textButtonWidth } from "@/hooks/business/table-actions/layout"
import type { ActionModel } from "@/hooks/business/table-actions/types"

export function createUserActionModel(): ActionModel<Api.SystemManage.User> {
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
        key: "user",
        matches: () => true,
        entries: [
          { kind: "action", key: "edit" },
          { kind: "menu", key: "more", actions: ["impersonate", "password", "resend", "delete"], width: 32 },
        ],
      },
    ],
  }
}
