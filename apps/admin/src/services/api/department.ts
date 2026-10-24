import type { ApiRequest, ApiResponse } from "@/typings/service"
import { request } from "@/services/request"

export type DepartmentTreeNode = ApiResponse<"/api/v1/departments/tree">[number]

export function fetchDepartmentTree() {
  return request<DepartmentTreeNode[]>({ url: "/departments/tree", method: "get" })
}

export type CreateDepartmentBody = ApiRequest<"/api/v1/departments", "post", "body">
export type UpdateDepartmentBody = ApiRequest<"/api/v1/departments/{dept_id}", "put", "body">
export type Department = ApiResponse<"/api/v1/departments", "post">

export function createDepartment(data: CreateDepartmentBody) {
  return request<Department>({ url: "/departments", method: "post", data })
}
export function updateDepartment(departmentId: string, data: UpdateDepartmentBody) {
  return request<Department>({ url: `/departments/${departmentId}`, method: "put", data })
}
export function deleteDepartment(departmentId: string) {
  return request<Department>({ url: `/departments/${departmentId}`, method: "delete" })
}
