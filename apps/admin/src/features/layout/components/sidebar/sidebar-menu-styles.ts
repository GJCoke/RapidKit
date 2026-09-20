import type { CSSProperties } from "react"
import { cn } from "@rapidkit/ui/lib/utils"
import styles from "./sidebar-menu.module.css"

export function getMenuButtonClasses({
  collapsed,
  active,
  branchActive,
}: {
  collapsed: boolean
  active: boolean
  branchActive: boolean
}) {
  return cn(
    "flex h-[var(--menu-item-height)] w-full items-center rounded-md py-0 text-sm transition-colors duration-300 ease-in-out motion-reduce:transition-none",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
    collapsed ? "justify-center gap-0 px-0" : "gap-2 px-3",
    active
      ? styles.activeLeaf
      : branchActive
        ? styles.activeBranch
        : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
  )
}

export function getMenuIconClasses(_collapsed: boolean) {
  return "size-[18px] shrink-0"
}

export function getMenuIndentStyle(depth: number, collapsed: boolean): CSSProperties | undefined {
  return collapsed ? undefined : { paddingLeft: `${depth * 18 + 12}px` }
}

export function getMenuLabelClasses(collapsed: boolean) {
  return cn(
    "overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-300 ease-in-out motion-reduce:transition-none",
    collapsed ? "max-w-0 opacity-0" : "max-w-48 opacity-100",
  )
}

export function getMenuChevronClasses(expanded: boolean, collapsed: boolean) {
  return cn(
    "size-4 shrink-0 transition-[transform,max-width,opacity] duration-300 ease-in-out motion-reduce:transition-none",
    collapsed
      ? "max-w-0 rotate-0 opacity-0"
      : expanded
        ? "max-w-4 rotate-180 opacity-100"
        : "max-w-4 rotate-0 opacity-100",
  )
}

export function getSubmenuPanelClasses() {
  return cn(
    "h-[var(--collapsible-panel-height)] contain-layout overflow-hidden opacity-100 transition-[height,opacity] duration-300 ease-in-out will-change-[height,opacity]",
    "data-[starting-style]:h-0 data-[starting-style]:opacity-0 data-[ending-style]:h-0 data-[ending-style]:opacity-0 motion-reduce:transition-none",
  )
}
