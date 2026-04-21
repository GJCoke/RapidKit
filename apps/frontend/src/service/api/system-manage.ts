import { request } from "../request"

// ==================== Role ====================

/** get role list */
export function fetchGetRoleList(params?: Api.SystemManage.RoleSearchParams) {
  return request<Api.SystemManage.RoleList>({
    url: "/roles",
    method: "get",
    params,
  })
}

/** get all roles (enabled) */
export function fetchGetAllRoles() {
  return request<Api.SystemManage.AllRole[]>({
    url: "/roles/all",
    method: "get",
  })
}

/** create role */
export function fetchCreateRole(
  data: Pick<Api.SystemManage.Role, "name" | "code" | "description"> & { status?: Api.Common.EnableStatus | null },
) {
  return request<Api.SystemManage.Role>({
    url: "/roles",
    method: "post",
    data,
  })
}

/** update role */
export function fetchUpdateRole(id: string, data: Partial<Api.SystemManage.Role>) {
  return request<Api.SystemManage.Role>({
    url: `/roles/${id}`,
    method: "put",
    data,
  })
}

/** delete role */
export function fetchDeleteRole(id: string) {
  return request<boolean>({
    url: `/roles/${id}`,
    method: "delete",
  })
}

/** batch delete roles */
export function fetchBatchDeleteRoles(ids: string[]) {
  return request<boolean>({
    url: "/roles",
    method: "delete",
    data: { ids },
  })
}

/** get role permissions */
export function fetchGetRolePermissions(id: string) {
  return request<Api.SystemManage.RolePermissions>({
    url: `/roles/${id}/permissions`,
    method: "get",
  })
}

/** batch update role permissions (router + button + interface) */
export function fetchUpdateRolePermissions(
  id: string,
  data: {
    routerPermissions: string[]
    buttonPermissions: string[]
    interfacePermissions: string[]
  },
) {
  return request<boolean>({
    url: `/roles/${id}/permissions`,
    method: "put",
    data,
  })
}

// ==================== User ====================

/** get user list */
export function fetchGetUserList(params?: Api.SystemManage.UserSearchParams) {
  return request<Api.SystemManage.UserList>({
    url: "/users",
    method: "get",
    params,
  })
}

/** create user */
export function fetchCreateUser(data: {
  name: string
  email: string
  username: string
  password: string
  status?: string
  roles?: string[]
  isAdmin?: boolean
  departmentId?: string
}) {
  return request<Api.SystemManage.User>({
    url: "/users",
    method: "post",
    data,
  })
}

/** update user */
export function fetchUpdateUser(
  id: string,
  data: {
    name?: string
    email?: string
    username?: string
    status?: string
    roles?: string[]
    isAdmin?: boolean
    departmentId?: string
  },
) {
  return request<Api.SystemManage.User>({
    url: `/users/${id}`,
    method: "put",
    data,
  })
}

/** delete user */
export function fetchDeleteUser(id: string) {
  return request<boolean>({
    url: `/users/${id}`,
    method: "delete",
  })
}

/** batch delete users */
export function fetchBatchDeleteUsers(ids: string[]) {
  return request<boolean>({
    url: "/users",
    method: "delete",
    data: { ids },
  })
}

/** change user password */
export function fetchChangePassword(userId: string, data: Api.SystemManage.ChangePassword) {
  return request<boolean>({
    url: `/users/${userId}/password`,
    method: "put",
    data,
  })
}

/** get all users (for select options) */
export function fetchGetAllUsers() {
  return request<Api.SystemManage.UserOption[]>({
    url: "/users/all",
    method: "get",
  })
}

// ==================== Menu ====================

/** get menu list */
export function fetchGetMenuList(params?: Api.SystemManage.MenuSearchParams) {
  return request<Api.SystemManage.MenuList>({
    url: "/manage/menus",
    method: "get",
    params,
  })
}

/** get all pages */
export function fetchGetAllPages() {
  return request<string[]>({
    url: "/manage/pages",
    method: "get",
  })
}

/** get menu tree */
export function fetchGetMenuTree() {
  return request<Api.SystemManage.MenuTree[]>({
    url: "/manage/menus/tree",
    method: "get",
  })
}

/** create menu */
export function fetchCreateMenu(data: Omit<Api.SystemManage.Menu, "id" | "children">) {
  return request<Api.SystemManage.Menu>({
    url: "/manage/menus",
    method: "post",
    data,
  })
}

/** update menu */
export function fetchUpdateMenu(id: string, data: Partial<Api.SystemManage.Menu>) {
  return request<Api.SystemManage.Menu>({
    url: `/manage/menus/${id}`,
    method: "put",
    data,
  })
}

/** delete menu */
export function fetchDeleteMenu(id: string) {
  return request<boolean>({
    url: `/manage/menus/${id}`,
    method: "delete",
  })
}

/** batch delete menus */
export function fetchBatchDeleteMenus(ids: string[]) {
  return request<boolean>({
    url: "/manage/menus",
    method: "delete",
    data: { ids },
  })
}

// ==================== Router ====================

/** get all backend routers */
export function fetchGetBackendRouters() {
  return request<Api.SystemManage.BackendRouter[]>({
    url: "/router/backend",
    method: "get",
  })
}

// ==================== Department ====================

/** get department tree */
export function fetchGetDepartmentTree() {
  return request<Api.SystemManage.DepartmentTree[]>({
    url: "/departments/tree",
    method: "get",
  })
}

/** create department */
export function fetchCreateDepartment(data: {
  parentId?: string | null
  name: string
  code: string
  sort?: number
  status?: Api.Common.EnableStatus
  leaderId?: string | null
}) {
  return request<Api.SystemManage.Department>({
    url: "/departments",
    method: "post",
    data,
  })
}

/** update department */
export function fetchUpdateDepartment(id: string, data: Partial<Api.SystemManage.Department>) {
  return request<Api.SystemManage.Department>({
    url: `/departments/${id}`,
    method: "put",
    data,
  })
}

/** delete department */
export function fetchDeleteDepartment(id: string) {
  return request<Api.SystemManage.Department>({
    url: `/departments/${id}`,
    method: "delete",
  })
}

// ==================== DataRule ====================

/** get data rule list (paginated) */
export function fetchGetDataRuleList(params?: Api.SystemManage.DataRuleSearchParams) {
  return request<Api.SystemManage.DataRuleList>({
    url: "/data-rules",
    method: "get",
    params,
  })
}

/** get all data rules (for select options) */
export function fetchGetAllDataRules() {
  return request<Api.SystemManage.DataRule[]>({
    url: "/data-rules/all",
    method: "get",
  })
}

/** create data rule */
export function fetchCreateDataRule(data: {
  name: string
  modelName: string
  field: string
  operator: string
  value: string
  logic?: string
}) {
  return request<Api.SystemManage.DataRule>({
    url: "/data-rules",
    method: "post",
    data,
  })
}

/** update data rule */
export function fetchUpdateDataRule(id: string, data: Partial<Api.SystemManage.DataRule>) {
  return request<Api.SystemManage.DataRule>({
    url: `/data-rules/${id}`,
    method: "put",
    data,
  })
}

/** delete data rule */
export function fetchDeleteDataRule(id: string) {
  return request<Api.SystemManage.DataRule>({
    url: `/data-rules/${id}`,
    method: "delete",
  })
}

// ==================== AuditDictionary ====================

/** get all audit dictionary entries */
export function fetchGetAuditDictList() {
  return request<Api.SystemManage.AuditDict[]>({
    url: "/system/audit-dict",
    method: "get",
  })
}

/** create audit dictionary entry */
export function fetchCreateAuditDict(data: { key: string; category: string; labelZh: string; labelEn: string }) {
  return request<Api.SystemManage.AuditDict>({
    url: "/system/audit-dict",
    method: "post",
    data,
  })
}

/** update audit dictionary entry */
export function fetchUpdateAuditDict(id: string, data: Partial<Api.SystemManage.AuditDict>) {
  return request<Api.SystemManage.AuditDict>({
    url: `/system/audit-dict/${id}`,
    method: "put",
    data,
  })
}

/** delete audit dictionary entry */
export function fetchDeleteAuditDict(id: string) {
  return request<boolean>({
    url: `/system/audit-dict/${id}`,
    method: "delete",
  })
}
