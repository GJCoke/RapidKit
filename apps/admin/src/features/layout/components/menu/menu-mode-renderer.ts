import type { LayoutMode, SidebarLayoutConfig } from "@/features/theme/theme-config"
import { resolveLayoutModeConfig } from "../layout-mode-config"

export interface ResolvedLayoutRegions {
  orientation: "vertical" | "horizontal"
  headerMenu: "none" | "all" | "first-level" | "active-children"
  sidebarMenu: "none" | "all" | "first-level" | "second-level" | "active-children"
  sidebarKind: "standard" | "mixed-first" | "mixed-second"
  sidebarVisible: boolean
  sidebarWidth: number
  showLogo: boolean
  showSidebarToggle: boolean
}

export function resolveLayoutRegions({
  mode,
  collapsed,
  activeFirstHasChildren,
  hasMixedChildMenus = activeFirstHasChildren,
  mixSiderFixed,
  sidebar,
}: {
  mode: LayoutMode
  collapsed: boolean
  activeFirstHasChildren: boolean
  hasMixedChildMenus?: boolean
  mixSiderFixed: boolean
  sidebar: SidebarLayoutConfig
}): ResolvedLayoutRegions {
  const config = resolveLayoutModeConfig(mode)
  const conditionalSidebar =
    (mode === "top-hybrid-header-first" || mode === "vertical-hybrid-header-first") && !activeFirstHasChildren
  const sidebarVisible = config.sidebar.visible && !conditionalSidebar
  const standardWidth = collapsed ? sidebar.collapsedWidth : sidebar.width
  const mixedWidth = collapsed ? sidebar.mixCollapsedWidth : sidebar.mixWidth
  const supportsFixedChild = mode === "vertical-mix" || mode === "vertical-hybrid-header-first"
  const sidebarWidth = !sidebarVisible
    ? 0
    : config.sidebar.kind === "standard"
      ? standardWidth
      : mixedWidth + (mixSiderFixed && supportsFixedChild && hasMixedChildMenus ? sidebar.mixChildMenuWidth : 0)

  return {
    orientation: config.orientation,
    headerMenu: config.header.menu,
    sidebarMenu: config.sidebar.menu,
    sidebarKind: config.sidebar.kind,
    sidebarVisible,
    sidebarWidth,
    showLogo:
      config.header.logo === "always" || (config.header.logo === "when-active-first-leaf" && !activeFirstHasChildren),
    showSidebarToggle:
      config.header.sidebarToggle === "always" ||
      (config.header.sidebarToggle === "when-active-first-has-children" && activeFirstHasChildren),
  }
}
