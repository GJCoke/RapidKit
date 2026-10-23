import type { TFunction } from "i18next"
/** Notification variables are interpolation data, never i18next runtime options. */
export function translateText(t: TFunction, key: string, params?: Record<string, unknown> | null): string {
  const value = t(key, {
    replace: params ?? {},
    returnObjects: true,
    returnDetails: false,
    ...(typeof params?.count === "number" && Number.isFinite(params.count) ? { count: params.count } : {}),
  })
  return typeof value === "string" ? value : key
}
