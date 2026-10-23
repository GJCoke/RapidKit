import { generatePath } from "react-router"
import { z } from "zod"
import type { RouteSnapshot } from "@/features/router/route-model"
import type { NotificationMessage, TopBanner } from "@/services/api/notification"

export function sanitizeNotification(message: NotificationMessage, recalls: ReadonlySet<string>): NotificationMessage {
  return message.status === "recalled" || recalls.has(message.messageId)
    ? {
        ...message,
        status: "recalled",
        title: "",
        content: "",
        contentMode: "raw",
        contentParams: null,
        action: null,
        mandatory: false,
      }
    : message
}
export function isNotificationActionable(message: NotificationMessage, now = Date.now()) {
  return (
    message.status !== "recalled" &&
    message.status !== "expired" &&
    (!message.expireAt || Date.parse(message.expireAt) > now) &&
    Boolean(message.action)
  )
}
const localeSchema = z.enum(["zh-CN", "en-US"])
const textSchema = z.object({ title: z.string(), content: z.string() })
const localizedSchema = z.object({
  defaultLocale: localeSchema,
  translations: z.record(localeSchema, textSchema),
  parameters: z.record(z.union([z.string(), z.number().finite(), z.boolean()])),
})
export function renderNotification(
  message: Pick<NotificationMessage, "title" | "content" | "contentMode" | "contentParams">,
  locale: string,
  translate: (key: string, params?: Record<string, unknown> | null) => string,
) {
  if (message.contentMode === "local") {
    const parsed = localizedSchema.safeParse(message.contentParams)
    if (parsed.success) {
      const data = parsed.data
      const requested = localeSchema.safeParse(locale)
      const candidate = requested.success ? data.translations[requested.data] : undefined
      const text =
        candidate?.title.trim() && candidate.content.trim() ? candidate : data.translations[data.defaultLocale]
      const substitute = (value: string) =>
        value.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (full, key: string) => {
          const parameter = data.parameters[key]
          return Object.hasOwn(data.parameters, key) && !(typeof parameter === "string" && !parameter.trim())
            ? String(parameter)
            : full
        })
      return { title: substitute(text?.title ?? ""), content: substitute(text?.content ?? "") }
    }
  }
  return {
    title: message.contentMode === "i18n" ? translate(message.title, message.contentParams) : message.title,
    content: message.contentMode === "i18n" ? translate(message.content, message.contentParams) : message.content,
  }
}
export function notificationActionLabel(action: Record<string, unknown> | null | undefined, locale: string) {
  const value = action?.localizedLabel ?? action?.localized_label
  const parsed = z
    .object({
      defaultLocale: localeSchema.optional(),
      default_locale: localeSchema.optional(),
      translations: z.record(localeSchema, z.string()),
    })
    .safeParse(value)
  if (parsed.success) {
    const requested = localeSchema.safeParse(locale)
    const fallback = parsed.data.defaultLocale ?? parsed.data.default_locale
    const label =
      (requested.success ? parsed.data.translations[requested.data]?.trim() : "") ||
      (fallback ? parsed.data.translations[fallback]?.trim() : "")
    if (label) return label
  }
  return typeof action?.label === "string" ? action.label.trim() : ""
}
const scalarRecord = z.record(z.union([z.string(), z.number().finite()]))
const actionSchema = z.object({
  type: z.enum(["route", "menu", "external"]).nullish(),
  route: z.string().optional(),
  path: z.string().optional(),
  url: z.string().optional(),
  params: scalarRecord.nullish(),
  query: scalarRecord.nullish(),
})
export function resolveNotificationAction(
  action: Record<string, unknown> | null | undefined,
  routes: RouteSnapshot,
): { href: string; external: boolean } | null {
  const parsed = actionSchema.safeParse(action)
  if (!parsed.success) return null
  const value = parsed.data
  if (value.type === "external") {
    // Reject controls and backslashes before URL parsing normalizes them away.
    // oxlint-disable-next-line no-control-regex
    if (!value.url || !/^https?:\/\//i.test(value.url) || /[\u0000-\u0020\u007f\\]/.test(value.url)) return null
    try {
      const url = new URL(value.url)
      return url.hostname && !url.username && !url.password ? { href: value.url, external: true } : null
    } catch {
      return null
    }
  }
  const routePattern = value.type === "menu" ? /^[a-z0-9][a-z0-9_-]*$/i : /^[a-z][a-z0-9_-]*$/i
  if (!value.route || !routePattern.test(value.route)) return null
  const target = routes.byName[value.route]
  if (!target || target.kind === "layout") return null
  try {
    const path = generatePath(
      target.fullPath,
      Object.fromEntries(Object.entries(value.params ?? {}).map(([key, v]) => [key, String(v)])),
    )
    if (value.type === "menu") {
      // oxlint-disable-next-line no-control-regex
      if (!value.path || !/^\/(?!\/)/.test(value.path) || /[\u0000-\u0020\u007f?#\\]/.test(value.path)) return null
      const segments = path.split("/"),
        snapshot = value.path.split("/")
      if (
        segments.length !== snapshot.length ||
        !segments.every((part, index) => decodeURIComponent(part) === decodeURIComponent(snapshot[index]))
      )
        return null
    }
    const query = new URLSearchParams(Object.entries(value.query ?? {}).map(([key, v]) => [key, String(v)]))
    return { href: `${path}${query.size ? `?${query}` : ""}`, external: false }
  } catch {
    return null
  }
}
export function currentBanner(snapshot: TopBanner | undefined, expectedRevision: number, now: number) {
  const item = snapshot?.current
  if (
    !item ||
    snapshot.revision < expectedRevision ||
    (snapshot.nextChangeAt && Date.parse(snapshot.nextChangeAt) <= now)
  )
    return null
  const start = item.publishAt ?? item.publishedAt
  if ((start && Date.parse(start) > now) || (item.expireAt && Date.parse(item.expireAt) <= now)) return null
  return item
}
