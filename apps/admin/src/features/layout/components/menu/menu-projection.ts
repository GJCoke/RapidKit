import type { MenuItem } from "@/stores/route"
import { findMenuPath, getVisibleChildren, resolveSelectedMenuKey } from "../sidebar/sidebar-menu-selection"

export interface MenuProjection {
  selectedKey: string | null
  selectedPath: string[]
  firstLevelMenus: MenuItem[]
  activeFirstLevel?: MenuItem
  secondLevelMenus: MenuItem[]
  activeSecondLevel?: MenuItem
  childLevelMenus: MenuItem[]
}

export function findFirstNavigableDescendant(item: MenuItem): MenuItem | null {
  const children = getVisibleChildren(item)
  if (!children.length) return item.path || item.href ? item : null
  for (const child of children) {
    const target = findFirstNavigableDescendant(child)
    if (target) return target
  }
  return null
}

export function projectMenus({
  menus,
  pathname,
  currentRoute,
}: {
  menus: MenuItem[]
  pathname: string
  currentRoute?: MenuItem
}): MenuProjection {
  const firstLevelMenus = menus.filter((item) => !item.hideInMenu)
  const selectedKey = resolveSelectedMenuKey({ currentRoute, menus: firstLevelMenus, pathname })
  const selectedPath = selectedKey ? findMenuPath(firstLevelMenus, selectedKey) : []
  const activeFirstLevel = firstLevelMenus.find((item) => item.key === selectedPath[0])
  const secondLevelMenus = activeFirstLevel ? getVisibleChildren(activeFirstLevel) : []
  const activeSecondLevel = secondLevelMenus.find((item) => item.key === selectedPath[1])
  const childLevelMenus = activeSecondLevel ? getVisibleChildren(activeSecondLevel) : []

  return {
    selectedKey,
    selectedPath,
    firstLevelMenus,
    activeFirstLevel,
    secondLevelMenus,
    activeSecondLevel,
    childLevelMenus,
  }
}
