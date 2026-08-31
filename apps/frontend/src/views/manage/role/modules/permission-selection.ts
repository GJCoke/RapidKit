export interface RolePermissionSelection {
  routerPermissions: string[]
  buttonPermissions: string[]
  interfacePermissions: string[]
}

interface PermissionTreeIndex {
  menuParents: Map<string, string | null>
  buttonMenus: Map<string, string>
  interfaceMenus: Map<string, string>
}

function indexMenuSubtreeKeys(
  menus: Api.SystemManage.MenuTree[],
  result = new Map<string, Set<string>>(),
): Map<string, Set<string>> {
  for (const menu of menus) {
    const keys = new Set<string>([
      `menu:${menu.routeName}`,
      ...(menu.buttons ?? []).map((button) => `btn:${button.code}`),
      ...(menu.interfaces ?? []).map((code) => `api:${code}`),
    ])

    indexMenuSubtreeKeys(menu.children ?? [], result)
    for (const child of menu.children ?? []) {
      for (const key of result.get(`menu:${child.routeName}`) ?? []) keys.add(key)
    }
    result.set(`menu:${menu.routeName}`, keys)
  }

  return result
}

export function applyPermissionCheckChange(
  previousKeys: readonly string[],
  nextKeys: readonly string[],
  menus: Api.SystemManage.MenuTree[],
): string[] {
  const nextKeySet = new Set(nextKeys)
  const removedMenuKeys = previousKeys.filter((key) => key.startsWith("menu:") && !nextKeySet.has(key))
  if (removedMenuKeys.length === 0) return [...nextKeys]

  const subtreeKeys = indexMenuSubtreeKeys(menus)
  const revokedKeys = new Set(removedMenuKeys.flatMap((key) => [...(subtreeKeys.get(key) ?? [])]))
  return nextKeys.filter((key) => !revokedKeys.has(key))
}

export function buildPermissionCheckedKeys(selection: RolePermissionSelection): string[] {
  return [
    ...selection.routerPermissions.map((key) => `menu:${key}`),
    ...selection.buttonPermissions.map((key) => `btn:${key}`),
    ...selection.interfacePermissions.map((key) => `api:${key}`),
  ]
}

function indexPermissionTree(
  menus: Api.SystemManage.MenuTree[],
  parentRouteName: string | null = null,
  index: PermissionTreeIndex = {
    menuParents: new Map(),
    buttonMenus: new Map(),
    interfaceMenus: new Map(),
  },
): PermissionTreeIndex {
  for (const menu of menus) {
    index.menuParents.set(menu.routeName, parentRouteName)

    for (const button of menu.buttons ?? []) {
      index.buttonMenus.set(button.code, menu.routeName)
    }
    for (const interfaceCode of menu.interfaces ?? []) {
      index.interfaceMenus.set(interfaceCode, menu.routeName)
    }
    indexPermissionTree(menu.children ?? [], menu.routeName, index)
  }

  return index
}

function addMenuPath(routeName: string, parents: Map<string, string | null>, result: Set<string>) {
  const path: string[] = []
  let current: string | null | undefined = routeName

  while (current && !result.has(current)) {
    path.push(current)
    current = parents.get(current)
  }
  for (const menu of path.reverse()) result.add(menu)
}

export function normalizePermissionSelection(
  checkedKeys: readonly string[],
  menus: Api.SystemManage.MenuTree[],
): RolePermissionSelection {
  const index = indexPermissionTree(menus)
  const selectedMenus = new Set<string>()
  const buttonPermissions = new Set<string>()
  const interfacePermissions = new Set<string>()

  for (const key of checkedKeys) {
    if (key.startsWith("menu:")) selectedMenus.add(key.slice(5))
    if (key.startsWith("btn:")) buttonPermissions.add(key.slice(4))
    if (key.startsWith("api:")) interfacePermissions.add(key.slice(4))
  }

  for (const button of buttonPermissions) {
    const owner = index.buttonMenus.get(button)
    if (owner) selectedMenus.add(owner)
  }
  for (const interfaceCode of interfacePermissions) {
    const owner = index.interfaceMenus.get(interfaceCode)
    if (owner) selectedMenus.add(owner)
  }

  const routerPermissions = new Set<string>()
  for (const menu of selectedMenus) addMenuPath(menu, index.menuParents, routerPermissions)

  return {
    routerPermissions: [...routerPermissions],
    buttonPermissions: [...buttonPermissions],
    interfacePermissions: [...interfacePermissions],
  }
}
