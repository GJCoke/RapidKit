import { useLayoutEffect, useState } from "react"
import { useThemeStore, type ColorScheme } from "@/stores/theme"
import { useThemeWorkbenchStore } from "@/stores/theme-workbench"
import { defaultThemeConfig } from "./theme-config"
import { getThemeCssVariables, getThemeRootState, resolveThemeConfig } from "./theme-resolver"

interface ThemeClassList {
  add: (token: string) => void
  remove: (token: string) => void
  toggle: (token: string, force?: boolean) => boolean
}

interface ThemeMediaQuery {
  matches: boolean
  addEventListener: (type: "change", listener: (event: { matches: boolean }) => void) => void
  removeEventListener: (type: "change", listener: (event: { matches: boolean }) => void) => void
}

export function syncColorScheme(
  colorScheme: ColorScheme,
  classList: ThemeClassList,
  matchMedia: (query: string) => ThemeMediaQuery,
  onResolvedScheme?: (dark: boolean) => void,
): () => void {
  if (colorScheme === "dark") {
    classList.add("dark")
    onResolvedScheme?.(true)
    return () => undefined
  }

  if (colorScheme === "light") {
    classList.remove("dark")
    onResolvedScheme?.(false)
    return () => undefined
  }

  const media = matchMedia("(prefers-color-scheme: dark)")
  const applySystemScheme = (event: { matches: boolean }) => {
    classList.toggle("dark", event.matches)
    onResolvedScheme?.(event.matches)
  }
  applySystemScheme(media)
  media.addEventListener("change", applySystemScheme)

  return () => media.removeEventListener("change", applySystemScheme)
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const colorScheme = useThemeStore((state) => state.colorScheme)
  const { draft, previewActive } = useThemeWorkbenchStore()
  const [resolvedDark, setResolvedDark] = useState(() => document.documentElement.classList.contains("dark"))

  useLayoutEffect(() => {
    return syncColorScheme(
      colorScheme,
      document.documentElement.classList,
      (query) => window.matchMedia(query),
      setResolvedDark,
    )
  }, [colorScheme])

  useLayoutEffect(() => {
    const root = document.documentElement
    const config = resolveThemeConfig(previewActive ? draft : defaultThemeConfig)
    const attributes = getThemeRootState(config, previewActive)
    const scheme = resolvedDark ? "dark" : "light"
    const variables = getThemeCssVariables(config, scheme)
    Object.entries(attributes).forEach(([name, value]) => root.setAttribute(name, value))
    Object.entries(variables).forEach(([name, value]) => root.style.setProperty(name, value))
    root.style.filter = [
      config.experience.grayscale ? "grayscale(100%)" : "",
      config.experience.colorVisionAssist ? "saturate(75%) contrast(110%)" : "",
    ]
      .filter(Boolean)
      .join(" ")
    return () => {
      Object.keys(attributes).forEach((name) => root.removeAttribute(name))
      Object.keys(variables).forEach((name) => root.style.removeProperty(name))
      root.style.removeProperty("filter")
    }
  }, [draft, previewActive, resolvedDark])

  return <>{children}</>
}
