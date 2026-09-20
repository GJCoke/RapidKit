import { matchPath } from "react-router"
import type { MenuItem } from "@/stores/route"

export interface BreadcrumbOption {
  key: string
  path: string
  title: string
  i18nKey?: string
  icon?: string
  localIcon?: string
  href?: string
  options?: BreadcrumbOption[]
}

export interface BreadcrumbNode extends Omit<BreadcrumbOption, "options"> {
  current: boolean
  options: BreadcrumbOption[]
}

function getVisibleChildren(item: MenuItem): MenuItem[] {
  return item.children?.filter((child) => !child.hideInMenu) ?? []
}

function findVisibleTrail(menus: MenuItem[], targetKey: string): MenuItem[] {
  for (const item of menus) {
    if (item.hideInMenu) continue
    if (item.key === targetKey) return [item]
    const descendants = findVisibleTrail(getVisibleChildren(item), targetKey)
    if (descendants.length) return [item, ...descendants]
  }
  return []
}

function toOption(item: MenuItem): BreadcrumbOption {
  const options = getVisibleChildren(item).map(toOption)
  return {
    key: item.key,
    path: item.path,
    title: item.title,
    i18nKey: item.i18nKey,
    icon: item.icon,
    localIcon: item.localIcon,
    href: item.href,
    ...(options.length ? { options } : {}),
  }
}

function toNodes(trail: MenuItem[]): BreadcrumbNode[] {
  return trail.map((item, index) => ({
    ...toOption(item),
    current: index === trail.length - 1,
    options: getVisibleChildren(item).map(toOption),
  }))
}

export function buildBreadcrumbs({
  pathname,
  menus,
  flat,
}: {
  pathname: string
  menus: MenuItem[]
  flat: Record<string, MenuItem>
}): BreadcrumbNode[] {
  const current =
    flat[pathname] ?? Object.entries(flat).find(([pattern]) => matchPath({ path: pattern, end: true }, pathname))?.[1]
  if (!current) return []

  const targetKey = current.hideInMenu ? current.activeMenu : current.key
  if (!targetKey) return []

  const visibleTrail = findVisibleTrail(menus, targetKey)
  if (!visibleTrail.length) return []

  const trail = current.hideInMenu ? [...visibleTrail, current] : visibleTrail
  const deduplicated = trail.filter(
    (item, index, items) => items.findIndex((candidate) => candidate.key === item.key) === index,
  )
  return toNodes(deduplicated)
}
