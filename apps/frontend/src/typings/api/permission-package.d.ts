import type { Service } from "@/typings/service"
declare global {
  namespace Api {
    namespace PermissionPackage {
      type Package = Service.ApiResponse<"/api/v1/permission-packages/all">[number]
      /** Local role draft operation; submitted through the permissions endpoint. */
      type ApplyMode = "merge" | "replace"
      type Catalog = Api.Permission.Catalog
      type CatalogCode = Catalog["codes"][number]
      type CatalogResource = Catalog["resources"][number]
    }
  }
}
export {}
