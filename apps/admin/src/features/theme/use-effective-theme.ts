import { defaultThemeConfig } from "./theme-config"
import { resolveThemeConfig } from "./theme-resolver"
import { useThemeWorkbenchStore } from "@/stores/theme-workbench"

export function useEffectiveThemeConfig() {
  const { draft, previewActive } = useThemeWorkbenchStore()
  return resolveThemeConfig(previewActive ? draft : defaultThemeConfig)
}
