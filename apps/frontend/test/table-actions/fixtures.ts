import type { ActionContext, ActionModel } from "@/hooks/business/table-actions/types"

export interface TestRow {
  builtin: boolean
  active: boolean
}

export function context(codes: PermissionCode[] = []): ActionContext {
  const allowed = new Set(codes)
  return {
    ready: true,
    hasAuth: (code) => allowed.has(code),
    actorId: "actor",
    isAdmin: false,
    impersonating: false,
    locale: "zh-CN",
  }
}

export const model: ActionModel<TestRow> = {
  actions: [
    { key: "detail", access: { kind: "page" }, width: 56 },
    { key: "edit", access: { kind: "all", codes: ["user:update"] }, width: 64 },
    {
      key: "delete",
      access: { kind: "all", codes: ["user:delete"] },
      width: 56,
      visible: (row) => !row.builtin,
      disabled: (row) => !row.active,
    },
  ],
  layouts: [
    { key: "builtin", matches: (row) => row.builtin, entries: [{ kind: "action", key: "detail" }] },
    {
      key: "custom",
      matches: () => true,
      entries: [
        { kind: "choice", key: "primary", actions: ["edit", "detail"] },
        { kind: "menu", key: "more", actions: ["delete"], width: 56 },
      ],
    },
  ],
}
