import type { ApiRequest, ApiResponse } from "@/typings/service"
import { request } from "@/services/request"

export type MenuSearchParams = ApiRequest<"/api/v1/manage/menus", "get", "query">
export type MenuList = ApiResponse<"/api/v1/manage/menus">
export type Menu = MenuList["records"][number]
export type CreateMenuBody = ApiRequest<"/api/v1/manage/menus", "post", "body">
export type UpdateMenuBody = ApiRequest<"/api/v1/manage/menus/{menu_id}", "put", "body">
export type ActiveMenuOption = ApiResponse<"/api/v1/manage/menus/active-menu-options">[number]
export function fetchMenus(params?: MenuSearchParams) {
  return request<MenuList>({ url: "/manage/menus", method: "get", params })
}
export function fetchMenuPages() {
  return request<ApiResponse<"/api/v1/manage/pages">>({ url: "/manage/pages", method: "get" })
}
export function fetchActiveMenuOptions(parentId: string, constant: boolean) {
  return request<ActiveMenuOption[]>({
    url: "/manage/menus/active-menu-options",
    method: "get",
    params: { parentId, constant },
  })
}
export function createMenu(data: CreateMenuBody) {
  return request<ApiResponse<"/api/v1/manage/menus", "post">>({ url: "/manage/menus", method: "post", data })
}
export function updateMenu(id: string, data: UpdateMenuBody) {
  return request<ApiResponse<"/api/v1/manage/menus/{menu_id}", "put">>({
    url: `/manage/menus/${id}`,
    method: "put",
    data,
  })
}
export function deleteMenu(id: string) {
  return request<boolean>({ url: `/manage/menus/${id}`, method: "delete" })
}
export function batchDeleteMenus(ids: string[]) {
  return request<boolean>({ url: "/manage/menus", method: "delete", data: { ids } })
}
