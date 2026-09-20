import {
  defaultThemeConfig,
  type AdminThemeConfig,
  type LayoutMode,
  type SemanticTokens,
  type ThemeScheme,
} from "./theme-config"

const layoutModes = [
  "vertical",
  "vertical-mix",
  "vertical-hybrid-header-first",
  "horizontal",
  "top-hybrid-sidebar-first",
  "top-hybrid-header-first",
] as const satisfies readonly LayoutMode[]

const allowed = <T extends string>(value: unknown, values: readonly T[], fallback: T): T =>
  typeof value === "string" && values.includes(value as T) ? (value as T) : fallback

export function resolveThemeConfig(input: AdminThemeConfig): AdminThemeConfig {
  return {
    ...defaultThemeConfig,
    ...input,
    shadcn: { ...defaultThemeConfig.shadcn, ...input.shadcn, base: "base" },
    appearance: {
      ...defaultThemeConfig.appearance,
      ...input.appearance,
      defaultScheme: allowed(input.appearance.defaultScheme, ["light", "dark", "system"], "light"),
      radius: allowed(input.appearance.radius, ["compact", "default", "soft"], "default"),
    },
    layout: {
      ...defaultThemeConfig.layout,
      ...input.layout,
      mode: allowed(input.layout?.mode, layoutModes, "vertical"),
      scrollMode: allowed(input.layout?.scrollMode, ["content", "body"], "content"),
      sidebarVariant: allowed(input.layout.sidebarVariant, ["standard", "floating", "inset"], "standard"),
      density: allowed(input.layout.density, ["compact", "comfortable"], "comfortable"),
      contentWidth: allowed(input.layout.contentWidth, ["fluid", "centered"], "fluid"),
    },
    sidebar: { ...defaultThemeConfig.sidebar, ...input.sidebar },
    experience: {
      ...defaultThemeConfig.experience,
      ...input.experience,
      motionPreset: allowed(input.experience.motionPreset, ["fade-slide", "fade", "zoom-fade"], "fade-slide"),
    },
    tokens: {
      light: { ...defaultThemeConfig.tokens.light, ...input.tokens.light },
      dark: { ...defaultThemeConfig.tokens.dark, ...input.tokens.dark },
    },
  }
}

export function getThemeRootState(config: AdminThemeConfig, previewActive: boolean): Record<string, string> {
  return {
    "data-theme": config.appearance.preset,
    "data-radius": config.appearance.radius,
    "data-density": config.layout.density,
    "data-sidebar": config.layout.sidebarVariant,
    "data-layout-mode": config.layout.mode,
    "data-content-width": config.layout.contentWidth,
    "data-motion": config.experience.pageMotion ? config.experience.motionPreset : "none",
    ...(previewActive ? { "data-theme-preview": "true" } : {}),
  }
}

const tokenNames: Record<keyof SemanticTokens, string> = {
  background: "--background",
  foreground: "--foreground",
  card: "--card",
  cardForeground: "--card-foreground",
  popover: "--popover",
  popoverForeground: "--popover-foreground",
  primary: "--primary",
  primaryForeground: "--primary-foreground",
  secondary: "--secondary",
  secondaryForeground: "--secondary-foreground",
  muted: "--muted",
  mutedForeground: "--muted-foreground",
  accent: "--accent",
  accentForeground: "--accent-foreground",
  destructive: "--destructive",
  destructiveForeground: "--destructive-foreground",
  border: "--border",
  input: "--input",
  ring: "--ring",
  chart1: "--chart-1",
  chart2: "--chart-2",
  chart3: "--chart-3",
  chart4: "--chart-4",
  chart5: "--chart-5",
  sidebar: "--sidebar",
  sidebarForeground: "--sidebar-foreground",
  sidebarPrimary: "--sidebar-primary",
  sidebarPrimaryForeground: "--sidebar-primary-foreground",
  sidebarAccent: "--sidebar-accent",
  sidebarAccentForeground: "--sidebar-accent-foreground",
  sidebarBorder: "--sidebar-border",
  sidebarRing: "--sidebar-ring",
  success: "--success",
  successForeground: "--success-foreground",
  warning: "--warning",
  warningForeground: "--warning-foreground",
  info: "--info",
  infoForeground: "--info-foreground",
}

export function getThemeCssVariables(config: AdminThemeConfig, scheme: Exclude<ThemeScheme, "system">) {
  return Object.fromEntries(
    Object.entries(config.tokens[scheme]).map(([key, value]) => [tokenNames[key as keyof SemanticTokens], value]),
  )
}
