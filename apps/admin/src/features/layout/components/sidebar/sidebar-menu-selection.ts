import type { MenuItem } from "@/stores/route"

export function getVisibleChildren(item: MenuItem): MenuItem[] {
  return item.children?.filter((child) => !child.hideInMenu) ?? []
}

export function findMenuPath(menus: MenuItem[], targetKey: string): string[] {
  for (const item of menus) {
    if (item.hideInMenu) continue
    if (item.key === targetKey) return [item.key]
    const childPath = findMenuPath(getVisibleChildren(item), targetKey)
    if (childPath.length) return [item.key, ...childPath]
  }
  return []
}

function findKeyByExactPath(menus: MenuItem[], pathname: string): string | null {
  for (const item of menus) {
    if (item.hideInMenu) continue
    const child = findKeyByExactPath(getVisibleChildren(item), pathname)
    if (child) return child
    if (item.path === pathname) return item.key
  }
  return null
}

export function resolveSelectedMenuKey({
  currentRoute,
  menus,
  pathname,
}: {
  currentRoute?: MenuItem
  menus: MenuItem[]
  pathname: string
}): string | null {
  const requestedKey = currentRoute?.hideInMenu ? currentRoute.activeMenu : currentRoute?.key
  if (requestedKey && findMenuPath(menus, requestedKey).length) return requestedKey
  if (currentRoute?.key && findMenuPath(menus, currentRoute.key).length) return currentRoute.key
  return findKeyByExactPath(menus, pathname)
}

export function getSelectedParentKeys(selectedPath: readonly string[]): string[] {
  return selectedPath.slice(0, -1)
}

export function reconcileExpandedKeys({
  collapsed,
  current,
  selectedPath,
  restoreSelectedPath,
}: {
  collapsed: boolean
  current: ReadonlySet<string>
  selectedPath: readonly string[]
  restoreSelectedPath: boolean
}): Set<string> {
  if (collapsed) return new Set()
  if (restoreSelectedPath) return new Set(getSelectedParentKeys(selectedPath))
  return new Set(current)
}
