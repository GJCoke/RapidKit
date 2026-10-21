export function permissionCode(code: string, depends: string[] = [], label = code): Api.Permission.CatalogCode {
  return {
    code,
    resource: code.split(":")[0]!,
    label,
    depends,
    abacAction: ["read", "preview", "options"].includes(code.split(":")[1]!) ? "read" : "write",
    source: "code",
  }
}

export function menu(id: string, props: Partial<Api.SystemManage.Menu> = {}): Api.SystemManage.Menu {
  return {
    id,
    menuName: id,
    menuType: "2",
    order: 0,
    status: "1",
    routeName: id,
    routePath: `/${id}`,
    constant: false,
    hideInMenu: false,
    createTime: "",
    updateTime: "",
    ...props,
  } as Api.SystemManage.Menu
}

const editorDepends = [
  "notification:read",
  "notification:preview",
  "notification-template:read",
  "role:options",
  "department:read",
  "user:options",
]
export const notificationCatalog: Api.Permission.Catalog = {
  resources: [
    ["notification", "公告管理"],
    ["notification-template", "模板管理"],
    ["notification-delivery", "投递状态"],
    ["user", "用户管理"],
    ["department", "部门管理"],
    ["role", "角色管理"],
  ].map(([key, label]) => ({ key: key!, label: label!, dataScopes: [], fieldGroups: [] })),
  codes: [
    permissionCode("notification-template:read", [], "查看模板"),
    ...["create", "update", "delete"].map((a, i) =>
      permissionCode(
        `notification-template:${a}`,
        ["notification-template:read"],
        ["新增模板", "编辑模板", "删除模板"][i],
      ),
    ),
    permissionCode("notification:read", [], "查看公告"),
    permissionCode("notification:preview", [], "预览公告"),
    ...["create", "update"].map((a, i) =>
      permissionCode(`notification:${a}`, editorDepends, ["新增公告", "编辑公告"][i]),
    ),
    ...["delete", "publish", "cancel", "recall"].map((a, i) =>
      permissionCode(`notification:${a}`, ["notification:read"], ["删除公告", "发布公告", "取消公告", "撤回公告"][i]),
    ),
    permissionCode("notification-delivery:read", ["notification:read"], "查看投递状态"),
    permissionCode("notification-delivery:retry", ["notification-delivery:read"], "重试失败投递"),
    permissionCode("user:options", [], "选择用户"),
    permissionCode("user:update", [], "编辑用户"),
    permissionCode("department:read", [], "查看部门"),
    permissionCode("role:options", [], "选择角色"),
  ],
}
export const notificationCodes = notificationCatalog.codes.filter((c) => c.resource.startsWith("notification"))
export const notificationMenus = [
  menu("notifications", {
    menuName: "通知管理",
    menuType: "1",
    children: [
      menu("templates", { order: 1, permission: "notification-template:read" }),
      menu("announcements", { order: 2, permission: "notification:read" }),
      menu("deliveries", { order: 3, permission: "notification-delivery:read" }),
    ],
  }),
]
