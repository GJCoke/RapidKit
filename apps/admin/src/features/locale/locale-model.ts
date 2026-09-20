export type AppLocale = "zh-CN" | "en-US"

export const DEFAULT_LOCALE: AppLocale = "zh-CN"

export const APP_LOCALES = [
  // Language names are intentional autonyms, so users can identify them before switching locale.
  { key: "zh-CN", label: "中文" },
  { key: "en-US", label: "English" },
] as const satisfies ReadonlyArray<{ key: AppLocale; label: string }>

export function isAppLocale(value: unknown): value is AppLocale {
  return value === "en-US" || value === "zh-CN"
}

export function resolveLocale(value: unknown): AppLocale {
  return isAppLocale(value) ? value : DEFAULT_LOCALE
}
