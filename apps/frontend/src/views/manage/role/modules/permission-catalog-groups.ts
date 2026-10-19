// apps/frontend/src/views/manage/role/modules/permission-catalog-groups.ts
type Catalog = Api.SystemManage.PermissionCatalog
type CatalogCode = Catalog["codes"][number]

export interface CatalogCodeGroup {
  key: string
  label: string
  codes: CatalogCode[]
  /** code -> labels of the codes it depends on */
  dependsLabels: Record<string, string[]>
}

export function groupCatalogCodes(catalog: Catalog): CatalogCodeGroup[] {
  const labels = new Map(catalog.codes.map((item) => [item.code, item.label]))
  const groups = new Map<string, CatalogCodeGroup>()
  for (const resource of catalog.resources) {
    groups.set(resource.key, { key: resource.key, label: resource.label, codes: [], dependsLabels: {} })
  }
  for (const item of catalog.codes) {
    const group = groups.get(item.resource)
    if (!group) continue
    group.codes.push(item)
    group.dependsLabels[item.code] = item.depends.map((code) => labels.get(code) ?? code)
  }
  return [...groups.values()].filter((group) => group.codes.length > 0)
}
