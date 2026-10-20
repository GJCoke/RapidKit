import { request } from "../request"

/** Fetch all permission packages (for applying to a role) */
export function fetchGetAllPermissionPackages() {
  return request<Api.PermissionPackage.Package[]>({ url: "/permission-packages/all", method: "get" })
}
