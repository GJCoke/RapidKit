export type ThemeScheme = "light" | "dark" | "system"
export type ThemeRadius = "compact" | "default" | "soft"
export type SidebarVariant = "standard" | "floating" | "inset"
export type ThemeDensity = "compact" | "comfortable"
export type ContentWidth = "fluid" | "centered"
export type MotionPreset = "fade-slide" | "fade" | "zoom-fade"
export type LayoutMode =
  | "vertical"
  | "vertical-mix"
  | "vertical-hybrid-header-first"
  | "horizontal"
  | "top-hybrid-sidebar-first"
  | "top-hybrid-header-first"
export type LayoutScrollMode = "content" | "body"

export interface SidebarLayoutConfig {
  width: number
  collapsedWidth: number
  mixWidth: number
  mixCollapsedWidth: number
  mixChildMenuWidth: number
  autoSelectFirstMenu: boolean
}

export interface ShadcnProjectConfig {
  style: "nova" | "vega" | "maia" | "lyra" | "mira" | "luma"
  base: "base"
  baseColor: string
  theme: string
  chartColor: string
  iconLibrary: string
  font: string
  fontHeading: string
  radius: string
  menuColor: string
  menuAccent: string
}

export interface SemanticTokens {
  background: string
  foreground: string
  card: string
  cardForeground: string
  popover: string
  popoverForeground: string
  primary: string
  primaryForeground: string
  secondary: string
  secondaryForeground: string
  muted: string
  mutedForeground: string
  accent: string
  accentForeground: string
  destructive: string
  destructiveForeground: string
  border: string
  input: string
  ring: string
  chart1: string
  chart2: string
  chart3: string
  chart4: string
  chart5: string
  sidebar: string
  sidebarForeground: string
  sidebarPrimary: string
  sidebarPrimaryForeground: string
  sidebarAccent: string
  sidebarAccentForeground: string
  sidebarBorder: string
  sidebarRing: string
  success: string
  successForeground: string
  warning: string
  warningForeground: string
  info: string
  infoForeground: string
}

export interface AdminThemeConfig {
  shadcn: ShadcnProjectConfig
  appearance: { defaultScheme: ThemeScheme; preset: string; customPrimary?: string; radius: ThemeRadius }
  layout: {
    mode: LayoutMode
    scrollMode: LayoutScrollMode
    sidebarVariant: SidebarVariant
    density: ThemeDensity
    contentWidth: ContentWidth
    fixedHeaderTabs: boolean
    showTabs: boolean
    defaultSidebarCollapsed: boolean
  }
  sidebar: SidebarLayoutConfig
  experience: {
    pageMotion: boolean
    motionPreset: MotionPreset
    navigationProgress: boolean
    middleClickCloseTab: boolean
    restoreTabs: boolean
    grayscale: boolean
    colorVisionAssist: boolean
  }
  tokens: { light: SemanticTokens; dark: SemanticTokens }
}

const neutralLight = {
  background: "oklch(1 0 0)",
  foreground: "oklch(0.145 0 0)",
  card: "oklch(1 0 0)",
  cardForeground: "oklch(0.145 0 0)",
  popover: "oklch(1 0 0)",
  popoverForeground: "oklch(0.145 0 0)",
  primary: "oklch(0.51 0.23 277)",
  primaryForeground: "oklch(0.985 0 0)",
  secondary: "oklch(0.97 0.01 277)",
  secondaryForeground: "oklch(0.205 0.02 277)",
  muted: "oklch(0.97 0.005 277)",
  mutedForeground: "oklch(0.556 0.02 277)",
  accent: "oklch(0.95 0.025 277)",
  accentForeground: "oklch(0.3 0.12 277)",
  destructive: "oklch(0.577 0.245 27.325)",
  destructiveForeground: "oklch(0.985 0 0)",
  border: "oklch(0.922 0.01 277)",
  input: "oklch(0.922 0.01 277)",
  ring: "oklch(0.6 0.2 277)",
  chart1: "oklch(0.56 0.22 277)",
  chart2: "oklch(0.65 0.16 245)",
  chart3: "oklch(0.62 0.14 190)",
  chart4: "oklch(0.7 0.16 85)",
  chart5: "oklch(0.62 0.2 325)",
  sidebar: "oklch(0.985 0.005 277)",
  sidebarForeground: "oklch(0.145 0.01 277)",
  sidebarPrimary: "oklch(0.51 0.23 277)",
  sidebarPrimaryForeground: "oklch(0.985 0 0)",
  sidebarAccent: "oklch(0.95 0.025 277)",
  sidebarAccentForeground: "oklch(0.3 0.12 277)",
  sidebarBorder: "oklch(0.922 0.01 277)",
  sidebarRing: "oklch(0.6 0.2 277)",
  success: "oklch(0.65 0.15 160)",
  successForeground: "oklch(0.985 0 0)",
  warning: "oklch(0.75 0.16 75)",
  warningForeground: "oklch(0.25 0.05 75)",
  info: "oklch(0.6 0.18 245)",
  infoForeground: "oklch(0.985 0 0)",
} satisfies SemanticTokens

const neutralDark = {
  background: "oklch(0.145 0.01 277)",
  foreground: "oklch(0.985 0 0)",
  card: "oklch(0.205 0.015 277)",
  cardForeground: "oklch(0.985 0 0)",
  popover: "oklch(0.205 0.015 277)",
  popoverForeground: "oklch(0.985 0 0)",
  primary: "oklch(0.7 0.18 277)",
  primaryForeground: "oklch(0.18 0.04 277)",
  secondary: "oklch(0.269 0.02 277)",
  secondaryForeground: "oklch(0.985 0 0)",
  muted: "oklch(0.269 0.015 277)",
  mutedForeground: "oklch(0.708 0.02 277)",
  accent: "oklch(0.3 0.055 277)",
  accentForeground: "oklch(0.95 0.02 277)",
  destructive: "oklch(0.704 0.191 22.216)",
  destructiveForeground: "oklch(0.985 0 0)",
  border: "oklch(1 0 0 / 10%)",
  input: "oklch(1 0 0 / 15%)",
  ring: "oklch(0.65 0.16 277)",
  chart1: "oklch(0.65 0.2 277)",
  chart2: "oklch(0.696 0.17 162.48)",
  chart3: "oklch(0.769 0.188 70.08)",
  chart4: "oklch(0.627 0.22 303.9)",
  chart5: "oklch(0.68 0.2 16.4)",
  sidebar: "oklch(0.18 0.015 277)",
  sidebarForeground: "oklch(0.985 0 0)",
  sidebarPrimary: "oklch(0.65 0.2 277)",
  sidebarPrimaryForeground: "oklch(0.985 0 0)",
  sidebarAccent: "oklch(0.269 0.035 277)",
  sidebarAccentForeground: "oklch(0.985 0 0)",
  sidebarBorder: "oklch(1 0 0 / 10%)",
  sidebarRing: "oklch(0.65 0.16 277)",
  success: "oklch(0.72 0.14 160)",
  successForeground: "oklch(0.18 0.02 160)",
  warning: "oklch(0.78 0.14 75)",
  warningForeground: "oklch(0.2 0.04 75)",
  info: "oklch(0.7 0.15 245)",
  infoForeground: "oklch(0.18 0.03 245)",
} satisfies SemanticTokens

export const defaultThemeConfig = {
  shadcn: {
    style: "nova",
    base: "base",
    baseColor: "neutral",
    theme: "indigo",
    chartColor: "indigo",
    iconLibrary: "lucide",
    font: "geist",
    fontHeading: "inherit",
    radius: "default",
    menuColor: "default",
    menuAccent: "subtle",
  },
  appearance: { defaultScheme: "light", preset: "cloud-indigo", radius: "default" },
  layout: {
    mode: "vertical",
    scrollMode: "content",
    sidebarVariant: "standard",
    density: "comfortable",
    contentWidth: "fluid",
    fixedHeaderTabs: true,
    showTabs: true,
    defaultSidebarCollapsed: false,
  },
  sidebar: {
    width: 220,
    collapsedWidth: 64,
    mixWidth: 90,
    mixCollapsedWidth: 64,
    mixChildMenuWidth: 200,
    autoSelectFirstMenu: false,
  },
  experience: {
    pageMotion: true,
    motionPreset: "fade-slide",
    navigationProgress: true,
    middleClickCloseTab: false,
    restoreTabs: true,
    grayscale: false,
    colorVisionAssist: false,
  },
  tokens: { light: neutralLight, dark: neutralDark },
} as const satisfies AdminThemeConfig
