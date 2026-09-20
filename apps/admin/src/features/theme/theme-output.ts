import type { AdminThemeConfig } from "./theme-config"

export function formatThemeConfigAsJson(config: AdminThemeConfig): string {
  return JSON.stringify(config, null, 2)
}

export function formatThemeConfigAsTypeScript(config: AdminThemeConfig): string {
  return `import type { AdminThemeConfig } from "./theme-config"\n\nexport const defaultThemeConfig = ${JSON.stringify(config, null, 2)} as const satisfies AdminThemeConfig\n`
}
