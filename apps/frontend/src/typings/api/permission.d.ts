declare global {
  namespace Api {
    namespace Permission {
      type AbacAction = "read" | "write"

      /** GET /permission-catalog（P2：Api.SystemManage.PermissionCatalog） */
      type Catalog = Api.SystemManage.PermissionCatalog

      /** a resource declared by backend plugins: key / label / dataScopes / fieldGroups */
      type CatalogResource = Catalog["resources"][number]

      /** a permission code; `source` is "extension" for runtime custom codes */
      type CatalogCode = Catalog["codes"][number]

      /** GET /roles/{role_id}/permissions：permissionCodes / dataScopes / fieldModes / invalidCodes / invalidScopes */
      type RolePermissions = Api.SystemManage.RolePermissions

      /** PUT /roles/{role_id}/permissions */
      type RolePermissionsBody = Api.SystemManage.RolePermissionsUpdate
    }
  }
}

export {}
