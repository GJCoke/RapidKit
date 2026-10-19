import { request } from "../request"

/** Fetch permission packages (paginated) */
export function fetchGetPermissionPackageList(params?: Api.PermissionPackage.SearchParams) {
  return request<Api.PermissionPackage.PackageList>({ url: "/permission-packages", method: "get", params })
}

/** Fetch all permission packages (for applying to a role) */
export function fetchGetAllPermissionPackages() {
  return request<Api.PermissionPackage.Package[]>({ url: "/permission-packages/all", method: "get" })
}

/** Create a custom permission package */
export function fetchCreatePermissionPackage(data: Api.PermissionPackage.PackageCreate) {
  return request<Api.PermissionPackage.Package>({ url: "/permission-packages", method: "post", data })
}

/** Update a custom permission package */
export function fetchUpdatePermissionPackage(id: string, data: Api.PermissionPackage.PackageUpdate) {
  return request<Api.PermissionPackage.Package>({ url: `/permission-packages/${id}`, method: "put", data })
}

/** Delete a custom permission package */
export function fetchDeletePermissionPackage(id: string) {
  return request<boolean>({ url: `/permission-packages/${id}`, method: "delete" })
}

/** Apply permission packages to a role (one-time expansion) */
export function fetchApplyPermissionPackages(roleId: string, data: Api.PermissionPackage.ApplyRequest) {
  return request<Api.PermissionPackage.ApplyResult>({ url: `/roles/${roleId}/apply-packages`, method: "post", data })
}
