import { $t } from "@/locales"
import { textButtonWidth } from "@/hooks/business/table-actions/layout"
import type { ActionDefinition, ActionModel } from "@/hooks/business/table-actions/types"

export function createMenuActionModel<Row>(): ActionModel<Row> {
  const actions: ActionDefinition<Row>[] = [
    {
      key: "addChild",
      access: { kind: "all", codes: ["menu:create"] },
      width: () => textButtonWidth($t("page.manage.menu.addChildMenu")),
    },
    { key: "edit", access: { kind: "all", codes: ["menu:update"] }, width: () => textButtonWidth($t("common.edit")) },
    {
      key: "delete",
      access: { kind: "all", codes: ["menu:delete"] },
      width: () => textButtonWidth($t("common.delete")),
    },
  ]
  return {
    actions,
    layouts: [{ key: "default", matches: () => true, entries: actions.map(({ key }) => ({ kind: "action", key })) }],
  }
}
