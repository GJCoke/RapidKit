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
export function fetchCreateRole(data: Omit<Api.SystemManage.Role, "id" | "status"> & { status?: string }) {
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

/** update role router permissions */
export function fetchUpdateRouterPermissions(id: string, permissions: string[]) {
  return request<boolean>({
    url: `/roles/${id}/permissions/router`,
    method: "put",
    data: { permissions },
  })
}

/** update role button permissions */
export function fetchUpdateButtonPermissions(id: string, permissions: string[]) {
  return request<boolean>({
    url: `/roles/${id}/permissions/button`,
    method: "put",
    data: { permissions },
  })
}

/** update role interface permissions */
export function fetchUpdateInterfacePermissions(id: string, permissions: string[]) {
  return request<boolean>({
    url: `/roles/${id}/permissions/interface`,
    method: "put",
    data: { permissions },
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
    password?: string
    status?: string
    roles?: string[]
    isAdmin?: boolean
  }
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
