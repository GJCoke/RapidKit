import { defaultThemeConfig, type AdminThemeConfig, type SemanticTokens } from "./theme-config"

interface ThemePreset {
  labelKey: string
  hue: number
  chroma: number
  tokens: AdminThemeConfig["tokens"]
}

function replaceBrand(tokens: SemanticTokens, hue: number, chroma: number, dark: boolean): SemanticTokens {
  const primary = `oklch(${dark ? 0.7 : 0.52} ${chroma} ${hue})`
  const subtle = `oklch(${dark ? 0.29 : 0.95} ${Math.min(chroma * 0.18, 0.04)} ${hue})`
  return {
    ...tokens,
    primary,
    primaryForeground: dark ? `oklch(0.18 0.03 ${hue})` : "oklch(0.985 0 0)",
    accent: subtle,
    accentForeground: `oklch(${dark ? 0.95 : 0.3} ${Math.min(chroma * 0.55, 0.13)} ${hue})`,
    ring: `oklch(0.62 ${Math.min(chroma, 0.2)} ${hue})`,
    sidebarPrimary: primary,
    sidebarPrimaryForeground: "oklch(0.985 0 0)",
    sidebarAccent: subtle,
    sidebarAccentForeground: `oklch(${dark ? 0.95 : 0.3} ${Math.min(chroma * 0.55, 0.13)} ${hue})`,
    sidebarRing: `oklch(0.62 ${Math.min(chroma, 0.2)} ${hue})`,
    chart1: primary,
    chart2: `oklch(0.65 ${Math.min(chroma * 0.75, 0.17)} ${(hue + 325) % 360})`,
    chart3: `oklch(0.65 ${Math.min(chroma * 0.65, 0.15)} ${(hue + 70) % 360})`,
    chart4: `oklch(0.72 ${Math.min(chroma * 0.7, 0.16)} ${(hue + 145) % 360})`,
    chart5: `oklch(0.65 ${Math.min(chroma * 0.8, 0.19)} ${(hue + 215) % 360})`,
  }
}

function preset(labelKey: string, hue: number, chroma: number): ThemePreset {
  return {
    labelKey,
    hue,
    chroma,
    tokens: {
      light: replaceBrand(defaultThemeConfig.tokens.light, hue, chroma, false),
      dark: replaceBrand(defaultThemeConfig.tokens.dark, hue, chroma, true),
    },
  }
}

export const themePresets = {
  "cloud-indigo": preset("theme.colors.presetCloudIndigo", 277, 0.23),
  ocean: preset("theme.colors.presetOcean", 245, 0.2),
  mineral: preset("theme.colors.presetMineral", 175, 0.15),
  violet: preset("theme.colors.presetViolet", 305, 0.21),
  rose: preset("theme.colors.presetRose", 12, 0.2),
  amber: preset("theme.colors.presetAmber", 72, 0.17),
} as const

export const themeWorkbenchOptions = {
  bases: [{ value: "base", label: "Base UI" }],
  styles: ["nova", "vega", "maia", "lyra", "mira", "luma"],
  baseColors: ["neutral", "stone", "zinc", "gray", "slate"],
  themes: ["indigo", "blue", "emerald", "violet", "rose", "amber"],
  chartColors: ["indigo", "blue", "emerald", "violet", "rose", "amber"],
  icons: ["lucide", "tabler", "hugeicons"],
  fonts: ["geist", "inter", "manrope", "system"],
  headingFonts: ["inherit", "geist", "inter", "manrope", "system"],
  menuColors: ["default", "muted", "inverted"],
  menuAccents: ["subtle", "bold"],
} as const
