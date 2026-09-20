import type { ApiResponse } from "@/typings/service"
import { request } from "@/services/request"

export type RoleOption = ApiResponse<"/api/v1/roles/all">[number]

export function fetchAllRoles() {
  return request<RoleOption[]>({ url: "/roles/all", method: "get" })
}
