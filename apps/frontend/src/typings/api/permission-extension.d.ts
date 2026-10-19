import type { Service } from "@/typings/service"

declare global {
  namespace Api {
    namespace PermissionExtension {
      type Extension = Service.ApiResponse<"/api/v1/permission-extensions">[number]
      type Kind = Extension["kind"]
      type Status = Extension["status"]
      type ExtensionCreate = Service.ApiRequest<"/api/v1/permission-extensions", "post", "body">
      type ExtensionUpdate = Service.ApiRequest<"/api/v1/permission-extensions/{extension_id}", "put", "body">
      type ListParams = Service.ApiRequest<"/api/v1/permission-extensions", "get", "query">
      type Denial = Service.ApiResponse<"/api/v1/permission-extensions/denials">[number]
      type Export = Service.ApiResponse<"/api/v1/permission-extensions/export">
    }
  }
}
