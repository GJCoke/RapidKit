/** Literal placeholder interpolation shared by editor previews and inbox messages. */
export const notificationLocales = ["zh-CN", "en-US"] as const
export type NotificationLocale = (typeof notificationLocales)[number]
export const localizedPlaceholder = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g

export function localizedParameterNames(translations: Record<string, { title: string; content: string }>) {
  return [
    ...new Set(
      Object.values(translations).flatMap(({ title, content }) =>
        [...`${title}\n${content}`.matchAll(localizedPlaceholder)].map((match) => match[1]!),
      ),
    ),
  ]
}

export function readLocalizedContent(value: unknown): Api.Notification.LocalizedContent | null {
  if (!value || typeof value !== "object") return null
  const data = value as Record<string, unknown>
  if (!notificationLocales.includes(data.defaultLocale as NotificationLocale)) return null
  if (!data.translations || typeof data.translations !== "object" || Array.isArray(data.translations)) return null
  if (!data.parameters || typeof data.parameters !== "object" || Array.isArray(data.parameters)) return null
  for (const [locale, text] of Object.entries(data.translations)) {
    if (!notificationLocales.includes(locale as NotificationLocale) || !text || typeof text !== "object") return null
    if (typeof text.title !== "string" || typeof text.content !== "string") return null
  }
  if (
    Object.values(data.parameters).some(
      (parameter) =>
        !["string", "number", "boolean"].includes(typeof parameter) ||
        (typeof parameter === "number" && !Number.isFinite(parameter)),
    )
  )
    return null
  return data as Api.Notification.LocalizedContent
}

export function renderLocalizedContent(value: unknown, locale: string) {
  const data = readLocalizedContent(value)
  if (!data) return null
  const complete = (text?: { title: string; content: string }) => Boolean(text?.title.trim() && text.content.trim())
  const requested = data.translations[locale]
  const used = complete(requested) ? locale : data.defaultLocale
  const text = data.translations[used]
  const parameters = data.parameters ?? {}
  const missing = new Set<string>()
  const replace = (source: string) =>
    source.replace(localizedPlaceholder, (full, name: string) => {
      if (
        !Object.hasOwn(parameters, name) ||
        (typeof parameters[name] === "string" && !String(parameters[name]).trim())
      ) {
        missing.add(name)
        return full
      }
      return String(parameters[name])
    })
  const title = replace(text?.title ?? "")
  const content = replace(text?.content ?? "")
  return { title, content, locale: used, fallback: used !== locale, missing: [...missing] }
}
