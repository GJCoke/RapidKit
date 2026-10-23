import { parseApiDate } from "@/shared/date-time"
import dayjs from "dayjs"
import { z } from "zod"
import type {
  AnnouncementAction,
  AnnouncementActionTarget,
  AnnouncementAudience,
  AnnouncementBannerCheck,
  AnnouncementBody,
  AnnouncementDetail,
} from "@/services/api/announcement"
import type { NotificationTemplate } from "@/services/api/notification-template"
import type { PermissionCode } from "@/typings/permission-codes"

export const announcementLocales = ["zh-CN", "en-US"] as const
export type AnnouncementLocale = (typeof announcementLocales)[number]
export const recipientFields = ["name", "email", "roles", "department"] as const
export type VariableSource = "manual" | (typeof recipientFields)[number]
export interface AnnouncementVariable {
  name: string
  type: string
  required: boolean
  value: string
  source: VariableSource
  rule: Record<string, unknown>
}
export interface AnnouncementForm {
  displayMode: "inbox" | "top_banner"
  contentSource: "raw" | "template" | "local" | "i18n"
  category: string
  level: AnnouncementBody["level"]
  rawTitle: string
  rawContent: string
  rawFormat: AnnouncementBody["rawFormat"]
  templateCode: string
  variables: AnnouncementVariable[]
  i18nKey: string
  i18nParams: string
  previewUserId: string
  localized: {
    defaultLocale: AnnouncementLocale
    translations: Record<AnnouncementLocale, { title: string; content: string }>
    parameters: Record<string, { type: "string" | "number" | "boolean"; value: string }>
  }
  audienceMode: "all" | "selected"
  audiences: AnnouncementAudience[]
  delivery: "now" | "scheduled"
  publishAt: string
  expires: boolean
  expireAt: string
  originalTimes: Partial<Record<"publishAt" | "expireAt", { local: string; utc: string }>>
  mandatory: boolean
  action: {
    type: "none" | "menu" | "external" | "legacy"
    menuId: string
    params: Record<string, string>
    query: Record<string, string>
    url: string
    route: string
    legacyParams: string
    label: string
    labels: Record<AnnouncementLocale, string>
  }
}
export class AnnouncementValidationError extends Error {
  constructor(
    public key: string,
    public params: Record<string, unknown> = {},
  ) {
    super(key)
  }
}
function fail(key: string, params: Record<string, unknown> = {}): never {
  throw new AnnouncementValidationError(key, params)
}
export function emptyAnnouncementForm(): AnnouncementForm {
  return {
    displayMode: "inbox",
    contentSource: "raw",
    category: "admin.announcement",
    level: "info",
    rawTitle: "",
    rawContent: "",
    rawFormat: "plain_text",
    templateCode: "",
    variables: [],
    i18nKey: "",
    i18nParams: "{}",
    previewUserId: "",
    localized: {
      defaultLocale: "zh-CN",
      translations: { "zh-CN": { title: "", content: "" }, "en-US": { title: "", content: "" } },
      parameters: {},
    },
    audienceMode: "all",
    audiences: [{ type: "user", value: "", includeDescendants: false }],
    delivery: "now",
    publishAt: "",
    expires: false,
    expireAt: "",
    originalTimes: {},
    mandatory: false,
    action: {
      type: "none",
      menuId: "",
      params: {},
      query: {},
      url: "",
      route: "notification_center",
      legacyParams: "{}",
      label: "",
      labels: { "zh-CN": "", "en-US": "" },
    },
  }
}
export const announcementCharacters = (value: string) => Array.from(value).length
export function localizedParameterNames(translations: AnnouncementForm["localized"]["translations"]) {
  return [
    ...new Set(
      Object.values(translations).flatMap((text) =>
        [...`${text.title}\n${text.content}`.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)].map((match) => match[1]!),
      ),
    ),
  ]
}
export function templateVariables(
  template: NotificationTemplate,
  values: Record<string, unknown> = {},
  bindings: NonNullable<AnnouncementBody["variableBindings"]> = {},
): AnnouncementVariable[] {
  return Object.entries(template.variableSchema).map(([name, rule]) => ({
    name,
    type: typeof rule.type === "string" ? rule.type : "string",
    required: Boolean(rule.required),
    rule,
    value:
      Object.hasOwn(values, name) && values[name] !== null && values[name] !== undefined ? String(values[name]) : "",
    source: Object.hasOwn(bindings, name) ? bindings[name]!.field : "manual",
  }))
}
export function announcementTemplateParameters(rows: AnnouncementVariable[]) {
  const values: [string, string | number | boolean][] = [],
    bindings: [string, { source: "recipient"; field: (typeof recipientFields)[number] }][] = []
  const missing: string[] = [],
    invalid: string[] = [],
    invalidBindings: string[] = []
  for (const row of rows) {
    if (row.source !== "manual") {
      if (row.type !== "string" || !recipientFields.includes(row.source)) invalidBindings.push(row.name)
      else bindings.push([row.name, { source: "recipient", field: row.source }])
      continue
    }
    if (!row.value) {
      if (row.required) missing.push(row.name)
      continue
    }
    const value = row.value.trim()
    if (row.type === "string") values.push([row.name, row.value])
    else if (row.type === "boolean" && ["true", "false"].includes(value)) values.push([row.name, value === "true"])
    else if (
      (row.type === "number" || row.type === "integer") &&
      /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value) &&
      Number.isFinite(Number(value)) &&
      (row.type !== "integer" || (/^[+-]?\d+$/.test(value) && Number.isSafeInteger(Number(value))))
    )
      values.push([row.name, Number(value)])
    else invalid.push(row.name)
  }
  if (invalidBindings.length) fail("bindingsInvalid", { names: invalidBindings.join("、") })
  if (missing.length) fail("variablesRequired", { names: missing.join("、") })
  if (invalid.length) fail("variablesInvalid", { names: invalid.join("、") })
  return { templateVariables: Object.fromEntries(values), variableBindings: Object.fromEntries(bindings) }
}
function jsonObject(text: string, error: string) {
  try {
    return z.record(z.unknown()).parse(JSON.parse(text))
  } catch {
    return fail(error)
  }
}
export function announcementAudience(form: AnnouncementForm): AnnouncementAudience[] {
  if (form.displayMode === "top_banner" || form.audienceMode === "all")
    return [{ type: "all", includeDescendants: false }]
  if (!form.audiences.length || form.audiences.some((rule) => rule.type === "all" || !rule.value?.trim()))
    fail("audienceRequired")
  return form.audiences.map((rule) => ({
    type: rule.type,
    value: rule.value!.trim(),
    includeDescendants: rule.type === "department" && Boolean(rule.includeDescendants),
  }))
}
function textLimits(title: string, content: string) {
  if (announcementCharacters(title) > 256) fail("titleTooLong")
  if (announcementCharacters(content) > 20_000) fail("contentTooLong")
}
export function announcementLocalizedContent(
  form: AnnouncementForm,
): NonNullable<AnnouncementBody["localizedContent"]> {
  const { localized } = form
  const translations: NonNullable<AnnouncementBody["localizedContent"]>["translations"] = {}
  for (const locale of announcementLocales) {
    const text = localized.translations[locale],
      complete = Boolean(text.title.trim() && text.content.trim())
    if (!complete && locale === localized.defaultLocale) fail("localizedDefaultRequired")
    if (!complete && (text.title.trim() || text.content.trim())) fail("localizedPartial", { locale })
    textLimits(text.title, text.content)
    if (complete) translations[locale] = { ...text }
  }
  const parameters: [string, string | number | boolean][] = [],
    missing: string[] = [],
    invalid: string[] = []
  for (const name of localizedParameterNames(localized.translations)) {
    const parameter = Object.hasOwn(localized.parameters, name) ? localized.parameters[name] : undefined
    if (!parameter?.value.trim()) {
      missing.push(name)
      continue
    }
    if (parameter.type === "string") parameters.push([name, parameter.value])
    else if (parameter.type === "number" && Number.isFinite(Number(parameter.value)))
      parameters.push([name, Number(parameter.value)])
    else if (parameter.type === "boolean" && ["true", "false"].includes(parameter.value))
      parameters.push([name, parameter.value === "true"])
    else invalid.push(name)
  }
  if (missing.length) fail("localizedValuesRequired", { names: missing.join("、") })
  if (invalid.length) fail("localizedValuesInvalid", { names: invalid.join("、") })
  return { defaultLocale: localized.defaultLocale, translations, parameters: Object.fromEntries(parameters) }
}
export function buildAnnouncementAction(
  form: AnnouncementForm,
  target?: AnnouncementActionTarget | null,
): AnnouncementAction | null {
  const action = form.action
  if (action.type === "none") return null
  let labels: Pick<AnnouncementAction, "label" | "localizedLabel"> = { label: action.label.trim() || null }
  if (form.contentSource === "local" && action.type !== "legacy") {
    const translations: Record<string, string> = {}
    for (const locale of announcementLocales) {
      if (announcementCharacters(action.labels[locale]) > 64) fail("actionLabelTooLong", { locale })
      if (action.labels[locale].trim()) translations[locale] = action.labels[locale].trim()
    }
    const label = translations[form.localized.defaultLocale]
    if (!label) fail("actionLabelDefaultRequired")
    labels = { label, localizedLabel: { defaultLocale: form.localized.defaultLocale, translations } }
  } else if (announcementCharacters(action.label) > 64) fail("actionLabelTooLong", { locale: "" })
  if (action.type === "external") {
    const url = action.url.trim()
    try {
      // oxlint-disable-next-line no-control-regex
      if (!/^https?:\/\//i.test(url) || /[\s\\\u0000-\u001f\u007f]/.test(url)) throw new Error("invalidUrl")
      const parsed = new URL(url)
      if (!parsed.hostname || parsed.username || parsed.password) throw new Error("invalidUrl")
    } catch {
      return fail("actionUrlInvalid")
    }
    return { type: "external", url, ...labels }
  }
  if (action.type === "legacy") {
    if (!action.route.trim()) fail("actionRouteRequired")
    return { route: action.route.trim(), params: jsonObject(action.legacyParams, "actionParamsInvalid"), ...labels }
  }
  if (!action.menuId.trim()) fail("actionMenuRequired")
  const params = Object.fromEntries(Object.entries(action.params).map(([name, value]) => [name, value.trim()]))
  const query = Object.fromEntries(Object.entries(action.query).map(([name, value]) => [name, value.trim()]))
  if (target?.menuId === action.menuId) {
    const descriptors = target.parameters ?? []
    const unknown = [
      ...Object.keys(params).filter((name) => !descriptors.some((row) => row.location === "path" && row.name === name)),
      ...Object.keys(query).filter((name) => !descriptors.some((row) => row.location === "query" && row.name === name)),
    ]
    if (unknown.length) fail("actionParametersUnknown", { names: unknown.join("、") })
    const missing: string[] = []
    for (const descriptor of descriptors) {
      const values = descriptor.location === "path" ? params : query
      const value = values[descriptor.name] || descriptor.defaultValue?.trim() || ""
      if (value) values[descriptor.name] = value
      else {
        delete values[descriptor.name]
        if (descriptor.required) missing.push(descriptor.name)
      }
    }
    if (missing.length) fail("actionParametersRequired", { names: missing.join("、") })
  }
  return { type: "menu", menuId: action.menuId.trim(), params, query, ...labels }
}
interface PayloadOptions {
  now?: number
  template?: NotificationTemplate | null
  target?: AnnouncementActionTarget | null
}
function announcementTime(form: AnnouncementForm, field: "publishAt" | "expireAt"): number {
  const original = form.originalTimes[field]
  // A datetime-local input cannot distinguish the two occurrences of a DST fold.
  // Preserve the original instant when its displayed wall time has not changed.
  if (original && dayjs(form[field]).format("YYYY-MM-DDTHH:mm:ss") === original.local)
    return parseApiDate(original.utc).getTime()
  return Date.parse(form[field])
}
export function buildAnnouncementPayload(
  form: AnnouncementForm,
  intent: "draft" | "publish",
  { now = Date.now(), template, target }: PayloadOptions = {},
): AnnouncementBody {
  if (!form.category.trim()) fail("categoryRequired")
  const banner = form.displayMode === "top_banner"
  if (banner && form.contentSource === "template" && form.variables.some((row) => row.source !== "manual"))
    fail("bannerManualOnly")
  let publishAt: string | null = null,
    expireAt: string | null = null
  if (form.delivery === "scheduled") {
    if (!form.publishAt) fail("publishAtRequired")
    const date = announcementTime(form, "publishAt")
    if (!Number.isFinite(date) || (intent === "publish" && date <= now)) fail("publishAtFuture")
    publishAt = new Date(date).toISOString().slice(0, 19)
  }
  if (form.expires) {
    const date = announcementTime(form, "expireAt"),
      start = form.delivery === "scheduled" ? announcementTime(form, "publishAt") : now
    if (!Number.isFinite(date) || date <= Math.max(now, start)) fail("expireAtInvalid")
    expireAt = new Date(date).toISOString().slice(0, 19)
  }
  const common: AnnouncementBody = {
    displayMode: form.displayMode,
    replaceCurrent: false,
    replaceScheduled: false,
    category: form.category.trim(),
    level: form.level,
    audience: announcementAudience(form),
    mandatory: banner ? false : form.mandatory,
    channels: banner ? [] : ["in_app"],
    rawFormat: form.rawFormat,
    action: buildAnnouncementAction(form, target),
    publishAt,
    expireAt,
    saveAsDraft: intent === "draft" || (!banner && form.delivery === "now"),
  }
  if (form.contentSource === "template") {
    if (!form.templateCode || !template?.enabled || template.code !== form.templateCode) fail("templateRequired")
    return { ...common, templateCode: form.templateCode, ...announcementTemplateParameters(form.variables) }
  }
  if (form.contentSource === "local") return { ...common, localizedContent: announcementLocalizedContent(form) }
  if (form.contentSource === "i18n") {
    if (!/^[a-z][a-zA-Z0-9]*(?:[._-][a-zA-Z0-9]+)+$/.test(form.i18nKey)) fail("i18nKeyInvalid")
    return { ...common, i18NKey: form.i18nKey, i18NParams: jsonObject(form.i18nParams, "i18nParamsInvalid") }
  }
  if (!form.rawTitle.trim()) fail("titleRequired")
  if (!form.rawContent.trim()) fail("contentRequired")
  textLimits(form.rawTitle, form.rawContent)
  return { ...common, rawTitle: form.rawTitle, rawContent: form.rawContent }
}
const locale = z.enum(announcementLocales)
const localizedSchema = z.object({
  defaultLocale: locale,
  translations: z.record(locale, z.object({ title: z.string(), content: z.string() })),
  parameters: z.record(z.union([z.string(), z.number().finite(), z.boolean()])).default({}),
})
function restoredRecord(value: unknown) {
  const parsed = z.record(z.unknown()).safeParse(value)
  return parsed.success
    ? Object.fromEntries(
        Object.entries(parsed.data).map(([key, value]) => [
          key,
          typeof value === "string" ? value : (JSON.stringify(value) ?? ""),
        ]),
      )
    : {}
}
export function restoredAnnouncementAction(
  value: unknown,
  defaultLocale: AnnouncementLocale = "zh-CN",
): AnnouncementForm["action"] {
  const result = emptyAnnouncementForm().action,
    parsed = z.record(z.unknown()).safeParse(value)
  if (!parsed.success) return result
  const action = parsed.data
  result.label = typeof action.label === "string" ? action.label : ""
  const labels = z
    .object({ translations: z.record(locale, z.string()) })
    .safeParse(action.localizedLabel ?? action.localized_label)
  if (labels.success) result.labels = { ...result.labels, ...labels.data.translations }
  else result.labels[defaultLocale] = result.label
  if (action.type === "external") {
    result.type = "external"
    result.url = typeof action.url === "string" ? action.url : ""
  } else if (action.type === "menu" || action.menuId || action.menu_id) {
    result.type = "menu"
    const id = action.menuId ?? action.menu_id
    result.menuId = typeof id === "string" ? id : ""
    result.params = restoredRecord(action.params)
    result.query = restoredRecord(action.query)
  } else {
    result.type = "legacy"
    result.route = typeof action.route === "string" ? action.route : ""
    result.legacyParams = JSON.stringify(action.params ?? {}, null, 2)
  }
  return result
}
export function restoreAnnouncementForm(
  detail: AnnouncementDetail,
  template?: NotificationTemplate | null,
  copy = false,
): AnnouncementForm {
  const form = emptyAnnouncementForm()
  form.displayMode = detail.displayMode ?? "inbox"
  form.contentSource = detail.templateCode
    ? "template"
    : detail.contentMode === "local"
      ? "local"
      : detail.contentMode === "i18n"
        ? "i18n"
        : "raw"
  form.category = detail.category
  form.level = detail.level
  form.rawTitle = detail.title
  form.rawContent = detail.content
  form.rawFormat = detail.contentFormat ?? "plain_text"
  form.templateCode = detail.templateCode ?? ""
  form.i18nKey = form.contentSource === "i18n" ? detail.title : ""
  form.i18nParams = JSON.stringify(detail.contentParams ?? {}, null, 2)
  form.mandatory = detail.mandatory
  if (form.contentSource === "local") {
    const data = localizedSchema.safeParse(detail.contentParams)
    if (data.success) {
      form.localized.defaultLocale = data.data.defaultLocale
      for (const locale of announcementLocales)
        if (data.data.translations[locale]) form.localized.translations[locale] = { ...data.data.translations[locale] }
      form.localized.parameters = Object.fromEntries(
        Object.entries(data.data.parameters).map(([name, value]) => [
          name,
          {
            type: typeof value === "boolean" ? "boolean" : typeof value === "number" ? "number" : "string",
            value: String(value),
          },
        ]),
      )
    }
  }
  form.audienceMode = detail.audiences.some((row) => row.type === "all") ? "all" : "selected"
  if (form.audienceMode === "selected") form.audiences = detail.audiences.map((row) => ({ ...row }))
  form.delivery = !copy && detail.publishAt ? "scheduled" : "now"
  form.publishAt = !copy && detail.publishAt ? dayjs(parseApiDate(detail.publishAt)).format("YYYY-MM-DDTHH:mm:ss") : ""
  form.expires = !copy && Boolean(detail.expireAt)
  form.expireAt = !copy && detail.expireAt ? dayjs(parseApiDate(detail.expireAt)).format("YYYY-MM-DDTHH:mm:ss") : ""
  if (!copy) {
    if (detail.publishAt) form.originalTimes.publishAt = { local: form.publishAt, utc: detail.publishAt }
    if (detail.expireAt) form.originalTimes.expireAt = { local: form.expireAt, utc: detail.expireAt }
  }
  form.action = restoredAnnouncementAction(detail.action, form.localized.defaultLocale)
  if (template && template.code === detail.templateCode)
    form.variables = templateVariables(template, detail.contentParams ?? {}, detail.variableBindings ?? {})
  return form
}
export type AnnouncementRowAction = "detail" | "edit" | "copy" | "publish" | "cancel" | "delete" | "recall"
export function announcementActions(
  row: { status: string },
  can: (code: PermissionCode) => boolean,
): AnnouncementRowAction[] {
  const result: AnnouncementRowAction[] = ["detail"]
  if (["draft", "scheduled"].includes(row.status) && can("notification:update")) result.push("edit")
  if (can("notification:create")) result.push("copy")
  if (row.status === "draft" && can("notification:update") && can("notification:publish")) result.push("publish")
  if (["draft", "scheduled"].includes(row.status)) {
    if (can("notification:cancel")) result.push("cancel")
    if (can("notification:delete")) result.push("delete")
  }
  if (row.status === "published" && can("notification:recall")) result.push("recall")
  return result
}
export function bannerPublication(
  body: AnnouncementBody,
  check: AnnouncementBannerCheck,
  id: string | null,
  requestId: string,
): AnnouncementBody {
  return {
    ...body,
    ...(!id ? { clientRequestId: requestId } : {}),
    bannerRevision: check.revision,
    replaceCurrent: Boolean(check.current),
    replaceScheduled: Boolean(body.publishAt && check.scheduled && check.scheduled.id !== id),
    saveAsDraft: false,
  }
}
