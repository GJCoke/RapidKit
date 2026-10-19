// apps/frontend/src/views/manage/permission-package/modules/package-actions.ts
import { $t } from "@/locales"
import { textButtonWidth } from "@/hooks/business/table-actions/layout"
import type { ActionModel } from "@/hooks/business/table-actions/types"

export function createPackageActionModel<Row extends { builtin: boolean }>(): ActionModel<Row> {
  return {
    actions: [
      { key: "detail", access: { kind: "page" }, width: () => textButtonWidth($t("common.detail")) },
      {
        key: "edit",
        access: { kind: "all", codes: ["permission-package:update"] },
        width: () => textButtonWidth($t("common.edit")),
      },
      {
        key: "delete",
        access: { kind: "all", codes: ["permission-package:delete"] },
        width: () => textButtonWidth($t("common.delete")),
      },
    ],
    layouts: [
      { key: "builtin", matches: (row) => row.builtin, entries: [{ kind: "action", key: "detail" }] },
      {
        key: "custom",
        matches: () => true,
        entries: [
          { kind: "choice", key: "primary", actions: ["edit", "detail"] },
          { kind: "action", key: "delete" },
        ],
      },
    ],
  }
}
