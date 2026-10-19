/** Local fixture only: production models and NaiveUI, no backend mutations or session changes. */
import { computed, createApp, defineComponent, h, reactive } from "vue"
import { NButton, NConfigProvider, NDataTable, NDropdown } from "naive-ui"
import type { DataTableColumns, DataTableRowData } from "naive-ui"
import { $t, getLocale, setLocale } from "@/locales"
import { createUserActionModel } from "@/views/manage/user/composables/user-actions"
import { createRoleActionModel } from "@/views/manage/role/modules/table-actions"
import { createPackageActionModel } from "@/views/manage/permission-package/modules/package-actions"
import {
  createAnnouncementActionModel,
  announcementActionLabel,
} from "@/views/notification/manage/announcements/modules/announcement-table"
import type { AnnouncementAction } from "@/views/notification/manage/announcements/modules/announcement-table"
import { textButtonWidth } from "@/hooks/business/table-actions/layout"
import { useTableActions } from "@/hooks/business/table-actions/use-table-actions"
import type { ActionModel } from "@/hooks/business/table-actions/types"
import { tableScrollWidth } from "@/hooks/common/table-columns"

const state = reactive({
  rights: "none",
  resident: false,
  busy: false,
  empty: false,
  locale: getLocale(),
  width: "1280",
})
const partial = new Set<PermissionCode>([
  "user:delete",
  "user:reset-password",
  "permission-package:update",
  "notification:create",
  "role:update",
  "role:delete",
])
const context = () => ({
  ready: true,
  actorId: "user-1",
  isAdmin: false,
  impersonating: false,
  locale: state.locale,
  isMobile: Number(state.width) < 640,
  hasAuth: (code: PermissionCode) => state.rights === "all" || (state.rights === "partial" && partial.has(code)),
})
const user = (id: string, status: Api.SystemManage.UserStatus): Api.SystemManage.User => ({
  id,
  status,
  isAdmin: false,
  name: id,
  username: id,
  email: `${id}@example.test`,
  roles: [],
  createTime: "2026-10-19",
  updateTime: "2026-10-19",
})
const userLabels: Record<string, I18nFullKey> = {
  detail: "common.detail",
  edit: "common.edit",
  password: "page.manage.user.changePassword",
  resend: "page.manage.user.resendInvite",
  delete: "common.delete",
  impersonate: "page.manage.user.impersonation.start",
}
const userModel = () => {
  const model = createUserActionModel()
  if (!state.resident) return model
  return {
    ...model,
    actions: [
      { key: "detail", access: { kind: "page" as const }, width: textButtonWidth($t("common.detail")) },
      ...model.actions,
    ],
    layouts: model.layouts.map((layout) => ({
      ...layout,
      entries: [{ kind: "action" as const, key: "detail" }, ...layout.entries],
    })),
  }
}
function scenario<Row extends DataTableRowData>(
  id: string,
  title: string,
  getModel: () => ActionModel<Row>,
  records: Row[],
  label: (row: Row, key: string) => string,
) {
  return defineComponent({
    setup() {
      const actions = useTableActions(getModel, context)
      const columns = computed<DataTableColumns<Row>>(() => [
        {
          key: "record",
          title: state.locale === "zh-CN" ? "记录" : "Record",
          minWidth: 240,
          render: (_, index) => `Record ${index + 1}`,
        },
        ...actions.column({
          key: "operate",
          title: $t("common.operate"),
          fixed: "right",
          cellProps: () => ({ class: "action-cell", "data-action-cell": id }),
          render: (row) =>
            h(
              "div",
              {
                style: {
                  display: "flex",
                  justifyContent: "flex-start",
                  alignItems: "center",
                  gap: "8px",
                  flexWrap: "nowrap",
                  whiteSpace: "nowrap",
                },
              },
              actions.rowEntries(row).map((entry) =>
                entry.kind === "menu"
                  ? h(
                      NDropdown,
                      {
                        options: entry.actions.map((key) => ({ key, label: label(row, key) })),
                        disabled: state.busy,
                        trigger: "click",
                      },
                      {
                        default: () =>
                          h(
                            NButton,
                            { size: "small", ghost: true, loading: state.busy, disabled: state.busy },
                            { default: () => (state.locale === "zh-CN" ? "更多" : "More") },
                          ),
                      },
                    )
                  : h(
                      NButton,
                      { size: "small", ghost: true, disabled: state.busy },
                      { default: () => label(row, entry.actions[0]) },
                    ),
              ),
            ),
        }),
      ])
      return () =>
        h("section", { "data-scenario": id, style: { marginBottom: "28px" } }, [
          h("h2", `${title} · ${actions.width.value}px`),
          h(NDataTable, {
            columns: columns.value,
            data: state.empty ? [] : records,
            scrollX: tableScrollWidth(columns.value),
            size: "small",
          }),
        ])
    },
  })
}
const UserScenario = scenario(
  "user",
  "用户操作模型",
  userModel,
  [user("user-1", "1"), user("user-2", "3"), user("user-3", "2")],
  (_, key) => $t(userLabels[key]),
)
const PackageScenario = scenario(
  "package",
  "权限包互斥模型",
  () => createPackageActionModel<{ builtin: boolean }>(),
  [{ builtin: true }, { builtin: false }],
  (_, key) => $t(key === "detail" ? "common.detail" : key === "edit" ? "common.edit" : "common.delete"),
)
const RoleScenario = scenario(
  "role",
  "角色操作模型",
  () => createRoleActionModel<Record<string, unknown>>(),
  [{}],
  (_, key) =>
    $t(key === "grant" ? "page.manage.role.applyPackage.button" : key === "edit" ? "common.edit" : "common.delete"),
)
const announcement = (status: Api.Notification.AnnouncementItem["status"]): Api.Notification.AnnouncementItem => ({
  id: status,
  title: status,
  content: "Fixture",
  category: "admin.announcement",
  level: "info",
  contentMode: "raw",
  displayMode: "inbox",
  source: "admin",
  mandatory: false,
  status,
  createTime: "2026-10-19",
  updateTime: "2026-10-19",
})
const AnnouncementScenario = scenario(
  "announcement",
  "公告菜单模型",
  createAnnouncementActionModel,
  [announcement("draft"), announcement("published")],
  (row, key) => announcementActionLabel(row, key as AnnouncementAction),
)

function toggle(label: string, key: "resident" | "busy" | "empty") {
  return h("label", [
    h("input", {
      type: "checkbox",
      checked: state[key],
      onChange: (event: Event) => {
        state[key] = (event.target as HTMLInputElement).checked
      },
    }),
    label,
  ])
}
function select(label: string, key: "rights" | "width", choices: Record<string, string>) {
  return h("label", [
    label,
    h(
      "select",
      {
        "aria-label": label,
        value: state[key],
        onChange: (event: Event) => {
          state[key] = (event.target as HTMLSelectElement).value
        },
      },
      Object.entries(choices).map(([value, text]) => h("option", { value }, text)),
    ),
  ])
}
createApp({
  render: () =>
    h(
      NConfigProvider,
      {},
      {
        default: () =>
          h(
            "main",
            { style: { maxWidth: "100%", width: `${state.width}px`, margin: "20px auto", fontFamily: "sans-serif" } },
            [
              h("h1", "操作区域布局验收"),
              h("p", "本地假数据；不会更改登录身份、角色权限或后端记录。"),
              h("div", { style: { display: "flex", flexWrap: "wrap", gap: "16px", marginBottom: "24px" } }, [
                select("模拟权限", "rights", { none: "无写权限", partial: "部分权限", all: "全部权限" }),
                select("容器宽度", "width", { "390": "390px", "1280": "1280px", "1920": "1920px" }),
                toggle("常驻详情", "resident"),
                toggle("请求中", "busy"),
                toggle("空数据", "empty"),
                h(
                  "button",
                  {
                    onClick: () => {
                      state.locale = state.locale === "zh-CN" ? "en-US" : "zh-CN"
                      setLocale(state.locale as I18n.LangType)
                    },
                  },
                  "切换语言",
                ),
              ]),
              h(UserScenario),
              h(RoleScenario),
              h(PackageScenario),
              h(AnnouncementScenario),
            ],
          ),
      },
    ),
}).mount("#app")
