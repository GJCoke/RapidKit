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
export function fetchUpdateRole(id: string, data: Api.SystemManage.UpdateRoleBody) {
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

/** update role permission codes; data scopes / field modes unchanged when omitted */
export function fetchUpdateRolePermissions(id: string, data: Api.SystemManage.RolePermissionsUpdate) {
  return request<boolean>({
    url: `/roles/${id}/permissions`,
    method: "put",
    data,
  })
}

/** get permission code catalog */
export function fetchGetPermissionCatalog() {
  return request<Api.SystemManage.PermissionCatalog>({
    url: "/permission-catalog",
    method: "get",
  })
}

// ==================== User ====================

/** get enabled super-administrator contacts */
export function fetchGetAdminContacts() {
  return request<Api.SystemManage.AdminContacts>({
    url: "/users/admin-contacts",
    method: "get",
  })
}

/** get user list */
export function fetchGetUserDepartmentCounts() {
  return request<Api.SystemManage.UserDepartmentCounts>({ url: "/users/department-counts", method: "get" })
}

/** get user list */
export function fetchGetUserList(params?: Api.SystemManage.UserSearchParams) {
  return request<Api.SystemManage.UserList>({
    url: "/users",
    method: "get",
    params,
  })
}

/** create user */
export function fetchCreateUser(data: Api.SystemManage.CreateUserBody) {
  return request<Api.SystemManage.User>({
    url: "/users",
    method: "post",
    data,
  })
}

/** validate whether username exactly matches canonical name pinyin */
export function fetchValidateUsernamePinyin(data: Api.SystemManage.UsernamePinyinValidationBody) {
  return request<Api.SystemManage.UsernamePinyinValidation>({
    url: "/users/validate-username-pinyin",
    method: "post",
    data,
  })
}

/** resend the invite email for a pending user */
export function fetchResendInvite(userId: string) {
  return request<boolean>({
    url: `/users/${userId}/resend-invite`,
    method: "post",
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
    departmentId?: string | null
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

/** get eligible visible ancestor pages for a hidden child page */
export function fetchGetActiveMenuOptions(parentId: string, constant: boolean) {
  const params: Api.SystemManage.ActiveMenuOptionsParams = { parentId, constant }

  return request<Api.SystemManage.ActiveMenuOption[]>({
    url: "/manage/menus/active-menu-options",
    method: "get",
    params,
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

// ==================== Audit Log ====================

/** Get paginated technical audit logs. */
export function fetchGetAuditLogList(params?: Api.SystemManage.AuditLogQuery) {
  return request<Api.SystemManage.AuditLogList>({
    url: "/system/audit-logs/paginate",
    method: "get",
    params,
  })
}

/** Get a technical audit log detail. */
export function fetchGetAuditLogDetail(id: string) {
  return request<Api.SystemManage.AuditLogDetail>({
    url: `/system/audit-logs/${id}`,
    method: "get",
  })
}

export function fetchGetAuditLogCatalog() {
  return request<Api.SystemManage.AuditCatalog>({ url: "/system/audit-logs/catalog", method: "get" })
}

export function fetchGetAuditLogActors(params?: Api.SystemManage.AuditActorQuery) {
  return request<Api.SystemManage.AuditActors>({ url: "/system/audit-logs/actors", method: "get", params })
}

export function fetchGetAuditLogTargets(id: string, params?: Api.SystemManage.AuditTargetQuery) {
  return request<Api.SystemManage.AuditTargets>({ url: `/system/audit-logs/${id}/targets`, method: "get", params })
}
