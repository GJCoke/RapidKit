import type { AdminThemeConfig } from "./theme-config"

export function isStructuralThemeChange(draft: AdminThemeConfig, source: AdminThemeConfig): boolean {
  return (
    draft.shadcn.style !== source.shadcn.style ||
    draft.shadcn.iconLibrary !== source.shadcn.iconLibrary ||
    draft.shadcn.font !== source.shadcn.font ||
    draft.shadcn.fontHeading !== source.shadcn.fontHeading
  )
}
