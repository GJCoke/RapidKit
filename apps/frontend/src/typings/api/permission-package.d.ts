import type { Service } from "@/typings/service"
declare global {
  namespace Api {
    namespace PermissionPackage {
      type Package = Service.ApiResponse<"/api/v1/permission-packages/all">[number]
      type PackageCreate = Service.ApiRequest<"/api/v1/permission-packages", "post", "body">
      type PackageUpdate = Service.ApiRequest<"/api/v1/permission-packages/{package_id}", "put", "body">
      type SearchParams = Service.ApiRequest<"/api/v1/permission-packages", "get", "query">
      type PackageList = Service.ApiResponse<"/api/v1/permission-packages">
      type ApplyRequest = Service.ApiRequest<"/api/v1/roles/{role_id}/apply-packages", "post", "body">
      type ApplyMode = NonNullable<ApplyRequest["mode"]>
      type ApplyResult = Service.ApiResponse<"/api/v1/roles/{role_id}/apply-packages", "post">
      type Catalog = Api.Permission.Catalog
      type CatalogCode = Catalog["codes"][number]
      type CatalogResource = Catalog["resources"][number]
    }
  }
}
export {}
