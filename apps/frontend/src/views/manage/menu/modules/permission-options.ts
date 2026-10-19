import type { SelectGroupOption } from "naive-ui"

/** Only non-constant page menus carry a permission code (directories follow their children). */
export function requiresMenuPermission(menuType: Api.SystemManage.MenuType, constant: boolean) {
  return menuType === "2" && !constant
}

/** Permission code options grouped by resource; resources without codes are hidden. */
export function buildPermissionCodeOptions(catalog: Api.Permission.Catalog | null): SelectGroupOption[] {
  if (!catalog) return []

  return catalog.resources
    .map((resource) => ({
      type: "group" as const,
      key: resource.key,
      label: resource.label,
      children: catalog.codes
        .filter((code) => code.resource === resource.key)
        .map((code) => ({ label: `${code.label}（${code.code}）`, value: code.code })),
    }))
    .filter((group) => group.children.length > 0)
}
