import { request } from "../request"

/** get role list */
export function fetchGetRoleList(params?: Api.SystemManage.RoleSearchParams) {
  return request<Api.SystemManage.RoleList>({
    url: "/roles",
    method: "get",
    params,
  })
}

/**
 * get all roles
 *
 * these roles are all enabled
 */
export function fetchGetAllRoles() {
  return request<Api.SystemManage.AllRole[]>({
    url: "/systemManage/getAllRoles",
    method: "get",
  })
}

/** get user list */
export function fetchGetUserList(params?: Api.SystemManage.UserSearchParams) {
  return request<Api.SystemManage.UserList>({
    url: "/systemManage/getUserList",
    method: "get",
    params,
  })
}

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
    url: "/systemManage/getMenuTree",
    method: "get",
  })
}
