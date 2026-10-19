import { $t } from "@/locales"
import { textButtonWidth } from "@/hooks/business/table-actions/layout"
import type { ActionModel } from "@/hooks/business/table-actions/types"

export function createTaskActionModel<Row extends { status: string }>(): ActionModel<Row> {
  return {
    actions: [
      { key: "detail", access: { kind: "page" }, width: () => textButtonWidth($t("common.detail")) },
      {
        key: "revoke",
        access: { kind: "all", codes: ["task:revoke"] },
        width: () => textButtonWidth($t("page.manage.worker.revokeTask")),
      },
    ],
    layouts: [
      {
        key: "running",
        matches: (row) => row.status === "1" || row.status === "2",
        entries: [
          { kind: "action", key: "detail" },
          { kind: "action", key: "revoke" },
        ],
      },
      { key: "other", matches: () => true, entries: [{ kind: "action", key: "detail" }] },
    ],
  }
}
