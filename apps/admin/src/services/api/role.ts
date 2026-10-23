import type { ApiRequest, ApiResponse } from "@/typings/service"
import { request } from "@/services/request"

export type RoleOption = ApiResponse<"/api/v1/roles/all">[number]

export function fetchAllRoles() {
  return request<RoleOption[]>({ url: "/roles/all", method: "get" })
}

export type RoleSearchParams = ApiRequest<"/api/v1/roles", "get", "query">
export type RoleList = ApiResponse<"/api/v1/roles">
export type Role = RoleList["records"][number]
export type CreateRoleBody = ApiRequest<"/api/v1/roles", "post", "body">
export type UpdateRoleBody = ApiRequest<"/api/v1/roles/{role_id}", "put", "body">
export type RolePermissions = ApiResponse<"/api/v1/roles/{role_id}/permissions">
export type RoleGrantBody = ApiRequest<"/api/v1/roles/{role_id}/permissions", "put", "body">
export type PermissionCatalog = ApiResponse<"/api/v1/permission-catalog">
export type CatalogCode = PermissionCatalog["codes"][number]
export type CatalogResource = PermissionCatalog["resources"][number]
export type PermissionPackage = ApiResponse<"/api/v1/permission-packages/all">[number]
export type PermissionMenuList = ApiResponse<"/api/v1/manage/menus">
export type PermissionMenu = PermissionMenuList["records"][number]

export function fetchRoles(params?: RoleSearchParams) {
  return request<RoleList>({ url: "/roles", method: "get", params })
}
export function createRole(data: CreateRoleBody) {
  return request<Role>({ url: "/roles", method: "post", data })
}
export function updateRole(roleId: string, data: UpdateRoleBody) {
  return request<Role>({ url: `/roles/${roleId}`, method: "put", data })
}
export function deleteRole(roleId: string) {
  return request<boolean>({ url: `/roles/${roleId}`, method: "delete" })
}
export function batchDeleteRoles(data: ApiRequest<"/api/v1/roles", "delete", "body">) {
  return request<boolean>({ url: "/roles", method: "delete", data })
}
export function fetchRolePermissions(roleId: string) {
  return request<RolePermissions>({ url: `/roles/${roleId}/permissions`, method: "get" })
}
export function updateRolePermissions(roleId: string, data: RoleGrantBody) {
  return request<boolean>({ url: `/roles/${roleId}/permissions`, method: "put", data })
}
export function fetchPermissionCatalog() {
  return request<PermissionCatalog>({ url: "/permission-catalog", method: "get" })
}
export function fetchPermissionPackages() {
  return request<PermissionPackage[]>({ url: "/permission-packages/all", method: "get" })
}
export function fetchPermissionMenus(params?: ApiRequest<"/api/v1/manage/menus", "get", "query">) {
  return request<PermissionMenuList>({ url: "/manage/menus", method: "get", params })
}
