import type { LayoutMode } from "@/features/theme/theme-config"

export type HeaderMenuProjection = "none" | "all" | "first-level" | "active-children"
export type SidebarMenuProjection = "none" | "all" | "first-level" | "second-level" | "active-children"
export type HeaderLogoRule = "always" | "never" | "when-active-first-leaf"
export type SidebarToggleRule = "always" | "never" | "when-active-first-has-children"

export interface LayoutModeConfig {
  orientation: "vertical" | "horizontal"
  header: {
    logo: HeaderLogoRule
    menu: HeaderMenuProjection
    sidebarToggle: SidebarToggleRule
  }
  sidebar: {
    visible: boolean
    kind: "standard" | "mixed-first" | "mixed-second"
    menu: SidebarMenuProjection
  }
}

export const layoutModeConfigs = {
  vertical: {
    orientation: "vertical",
    header: { logo: "never", menu: "none", sidebarToggle: "always" },
    sidebar: { visible: true, kind: "standard", menu: "all" },
  },
  "vertical-mix": {
    orientation: "vertical",
    header: { logo: "never", menu: "none", sidebarToggle: "never" },
    sidebar: { visible: true, kind: "mixed-first", menu: "first-level" },
  },
  "vertical-hybrid-header-first": {
    orientation: "vertical",
    header: { logo: "when-active-first-leaf", menu: "first-level", sidebarToggle: "never" },
    sidebar: { visible: true, kind: "mixed-second", menu: "second-level" },
  },
  horizontal: {
    orientation: "horizontal",
    header: { logo: "always", menu: "all", sidebarToggle: "never" },
    sidebar: { visible: false, kind: "standard", menu: "none" },
  },
  "top-hybrid-sidebar-first": {
    orientation: "horizontal",
    header: { logo: "always", menu: "active-children", sidebarToggle: "never" },
    sidebar: { visible: true, kind: "mixed-first", menu: "first-level" },
  },
  "top-hybrid-header-first": {
    orientation: "horizontal",
    header: { logo: "always", menu: "first-level", sidebarToggle: "when-active-first-has-children" },
    sidebar: { visible: true, kind: "standard", menu: "active-children" },
  },
} as const satisfies Record<LayoutMode, LayoutModeConfig>

export function resolveLayoutModeConfig(mode: LayoutMode): LayoutModeConfig {
  return layoutModeConfigs[mode]
}
