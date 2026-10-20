import { request } from "../request"

/** Fetch all permission packages (for applying to a role) */
export function fetchGetAllPermissionPackages() {
  return request<Api.PermissionPackage.Package[]>({ url: "/permission-packages/all", method: "get" })
}

/** Apply permission packages to a role (one-time expansion) */
export function fetchApplyPermissionPackages(roleId: string, data: Api.PermissionPackage.ApplyRequest) {
  return request<Api.PermissionPackage.ApplyResult>({ url: `/roles/${roleId}/apply-packages`, method: "post", data })
}
