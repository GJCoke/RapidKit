import { buildPermissionRows, type PermissionMatrixRow } from "./permission-matrix"

export interface PermissionModuleEntry {
  row: PermissionMatrixRow
  path: string[]
  ownerKey: string
  icon?: string | null
  iconType?: Api.SystemManage.Menu["iconType"]
}

export interface PermissionModule {
  key: string
  label: string
  i18nKey?: string | null
  icon?: string | null
  iconType?: Api.SystemManage.Menu["iconType"]
  entries: PermissionModuleEntry[]
}

export function buildPermissionModules(catalog: Api.Permission.Catalog, menus: readonly Api.SystemManage.Menu[]) {
  const rows = buildPermissionRows(catalog)
  const byResource = new Map(rows.map((row) => [row.resource.key, row]))
  const codes = new Map(catalog.codes.map((code) => [code.code, code]))
  const owners = new Map<string, string>()
  const modules: PermissionModule[] = []
  const invalid = new Set<string>()
  const sorted = (items: readonly Api.SystemManage.Menu[]) =>
    [...items].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id))
  const eligible = (item: Api.SystemManage.Menu) =>
    item.status === "1" && !item.constant && !item.hideInMenu && !item.href

  function visit(item: Api.SystemManage.Menu, module: PermissionModule, path: string[]) {
    if (!eligible(item)) return
    if (item.menuType === "2" && item.permission) {
      const code = codes.get(item.permission)
      if (!code) invalid.add(item.permission)
      const row = code && byResource.get(code.resource)
      if (row && !module.entries.some((entry) => entry.row.resource.key === row.resource.key)) {
        if (!owners.has(row.resource.key)) owners.set(row.resource.key, module.key)
        module.entries.push({
          row,
          path,
          ownerKey: owners.get(row.resource.key)!,
          icon: item.icon,
          iconType: item.iconType,
        })
      }
    }
    const nextPath = item.id !== module.key && item.menuType === "1" ? [...path, item.menuName] : path
    for (const child of sorted(item.children ?? [])) visit(child, module, nextPath)
  }

  for (const root of sorted(menus)) {
    const module: PermissionModule = {
      key: root.id,
      label: root.menuName,
      i18nKey: root.i18nKey,
      icon: root.icon,
      iconType: root.iconType,
      entries: [],
    }
    visit(root, module, [])
    if (module.entries.length) modules.push(module)
  }
  const remaining = rows.filter((row) => !owners.has(row.resource.key))
  if (remaining.length)
    modules.push({
      key: "other",
      label: "other",
      icon: "carbon:category",
      iconType: "1",
      entries: remaining.map((row) => ({
        row,
        ownerKey: "other",
        path: [...new Set(row.codes.map((code) => code.source))].sort(),
      })),
    })
  return { modules, invalidMenuPermissions: [...invalid].sort() }
}
