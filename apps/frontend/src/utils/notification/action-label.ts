import { notificationLocales } from "./localized-content"
import type { NotificationLocale } from "./localized-content"

/** Stored action JSON uses snake case; action-preview responses use camel case. */
export function readLocalizedActionLabel(action: Record<string, unknown> | null | undefined) {
  const value = action?.localizedLabel ?? action?.localized_label
  if (!value || typeof value !== "object") return null
  const envelope = value as Record<string, unknown>
  const defaultLocale = envelope.defaultLocale ?? envelope.default_locale
  if (!notificationLocales.includes(defaultLocale as NotificationLocale)) return null
  if (!envelope.translations || typeof envelope.translations !== "object" || Array.isArray(envelope.translations))
    return null
  const translations = envelope.translations as Partial<Record<NotificationLocale, unknown>>
  return {
    defaultLocale: defaultLocale as NotificationLocale,
    translations: Object.fromEntries(
      notificationLocales.flatMap((locale) =>
        typeof translations[locale] === "string" ? [[locale, translations[locale]]] : [],
      ),
    ) as Partial<Record<NotificationLocale, string>>,
  }
}

export function resolveActionLabel(action: Record<string, unknown> | null | undefined, locale: string) {
  const localized = readLocalizedActionLabel(action)
  if (localized) {
    const requested = notificationLocales.includes(locale as NotificationLocale)
      ? localized.translations[locale as NotificationLocale]?.trim()
      : undefined
    if (requested) return { text: requested, locale, fallback: false }
    const fallback = localized.translations[localized.defaultLocale]?.trim()
    if (fallback) return { text: fallback, locale: localized.defaultLocale, fallback: true }
  }
  return { text: typeof action?.label === "string" ? action.label.trim() : "", locale, fallback: false }
}
