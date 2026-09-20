import type { ApiResponse } from "@/typings/service"
import { request } from "@/services/request"

export type DepartmentTreeNode = ApiResponse<"/api/v1/departments/tree">[number]

export function fetchDepartmentTree() {
  return request<DepartmentTreeNode[]>({ url: "/departments/tree", method: "get" })
}
