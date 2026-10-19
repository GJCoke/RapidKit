import { request } from "../request"

// ==================== Permission Extension ====================

/** Fetch all permission extensions with their current status */
export function fetchGetPermissionExtensions(params?: Api.PermissionExtension.ListParams) {
  return request<Api.PermissionExtension.Extension[]>({ url: "/permission-extensions", method: "get", params })
}

/** Create a permission extension */
export function fetchCreatePermissionExtension(data: Api.PermissionExtension.ExtensionCreate) {
  return request<Api.PermissionExtension.Extension>({ url: "/permission-extensions", method: "post", data })
}

/** Update note / label / action of a permission extension */
export function fetchUpdatePermissionExtension(id: string, data: Api.PermissionExtension.ExtensionUpdate) {
  return request<Api.PermissionExtension.Extension>({ url: `/permission-extensions/${id}`, method: "put", data })
}

/** Delete a permission extension */
export function fetchDeletePermissionExtension(id: string) {
  return request<null>({ url: `/permission-extensions/${id}`, method: "delete" })
}

/** Export active extensions as code declarations */
export function fetchExportPermissionExtensions() {
  return request<Api.PermissionExtension.Export>({ url: "/permission-extensions/export", method: "get" })
}

/** Fetch recently denied permission codes */
export function fetchGetPermissionDenials(days = 7) {
  return request<Api.PermissionExtension.Denial[]>({
    url: "/permission-extensions/denials",
    method: "get",
    params: { days },
  })
}
