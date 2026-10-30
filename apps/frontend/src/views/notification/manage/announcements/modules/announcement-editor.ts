import type { NotificationLocale } from "@/utils/notification/localized-content"
import { buildLocalizedContent, createLocalizedEditor, LocalizedValidationError } from "./localized-editor"
import type { LocalizedEditorState } from "./localized-editor"
import { exampleValue, schemaToRows, variableTypes } from "../../templates/modules/template-editor"
import type { VariableRow, VariableSchema } from "../../templates/modules/template-editor"
import { buildAnnouncementAction } from "./announcement-action"
import { parsePlatformTimeInput } from "@/utils/datetime"

export const recipientFields = ["name", "email", "roles", "department"] as const
export type VariableSource = "manual" | (typeof recipientFields)[number]
export type AnnouncementVariableRow = VariableRow & { source: VariableSource }
type VariableBindings = NonNullable<Api.Notification.AnnouncementUpdate["variableBindings"]>

export interface AnnouncementModel {
  category: string
  level: Api.Notification.Level
  rawTitle: string
  rawContent: string
  rawFormat: Api.Notification.ContentFormat
  templateCode: string | null
  i18NKey: string
  mandatory: boolean
  publishAt: string | null
  expireAt: string | null
  actionRoute: string
  actionLabel: string
}

export interface AnnouncementState {
  originalTimes: { publishAt: string | null; expireAt: string | null }
  model: AnnouncementModel
  displayMode: "inbox" | "top_banner"
  contentMode: "raw" | "template" | "i18n" | "local"
  localized: LocalizedEditorState
  variableRows: AnnouncementVariableRow[]
  audienceMode: "all" | "selected"
  audiences: Api.Notification.AudienceRule[]
  delivery: "now" | "scheduled"
  expires: boolean
  actionEnabled: boolean
  actionParams: string
  actionType: "menu" | "external" | "legacy"
  actionMenuId: string | null
  actionValues: Record<string, string>
  actionQuery: Record<string, string>
  actionUrl: string
  actionTarget: Api.Notification.ActionTarget | null
  actionLabels: Record<NotificationLocale, string>
  i18nParams: string
}

export class AnnouncementValidationError extends Error {
  constructor(
    public key: string,
    public params: Record<string, unknown> = {},
  ) {
    super(key)
  }
}

export function createAnnouncementState(): AnnouncementState {
  return {
    originalTimes: { publishAt: null, expireAt: null },
    model: {
      category: "admin.announcement",
      level: "info",
      rawTitle: "",
      rawContent: "",
      rawFormat: "plain_text",
      templateCode: null,
      i18NKey: "",
      mandatory: false,
      publishAt: null,
      expireAt: null,
      actionRoute: "notification_center",
      actionLabel: "",
    },
    displayMode: "inbox",
    contentMode: "raw",
    localized: createLocalizedEditor(),
    variableRows: [],
    audienceMode: "all",
    audiences: [{ type: "user", value: "" }],
    delivery: "now",
    expires: false,
    actionEnabled: false,
    actionParams: "{}",
    actionType: "menu",
    actionMenuId: null,
    actionValues: {},
    actionQuery: {},
    actionUrl: "",
    actionTarget: null,
    actionLabels: { "zh-CN": "", "en-US": "" },
    i18nParams: "{}",
  }
}

/** Saved examples are metadata, never defaults for an actual announcement. */
export function templateValueRows(
  schema: VariableSchema,
  values: Record<string, unknown> = {},
  bindings: VariableBindings = {},
): AnnouncementVariableRow[] {
  return schemaToRows(schema).map((row) => {
    const value = values[row.name]
    return {
      ...row,
      example: value === undefined || value === null ? "" : String(value),
      source: bindings[row.name]?.field ?? "manual",
    }
  })
}

/** Only manual values are sent literally; built-ins are resolved per recipient by the server. */
export function announcementTemplateParameters(rows: AnnouncementVariableRow[]) {
  const variableBindings: VariableBindings = {}
  const invalid: string[] = []
  for (const row of rows) {
    if (row.source === "manual") continue
    if (row.type !== "string" || !recipientFields.includes(row.source)) invalid.push(row.name)
    else variableBindings[row.name] = { source: "recipient", field: row.source }
  }
  if (invalid.length) throw new AnnouncementValidationError("bindingsInvalid", { names: invalid.join("、") })
  return {
    templateVariables: actualTemplateValues(rows.filter((row) => row.source === "manual")),
    variableBindings,
  }
}

export function parseObject(text: string): Record<string, unknown> {
  const value: unknown = JSON.parse(text)
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("objectRequired")
  return value as Record<string, unknown>
}

export function normalizeAudience(mode: AnnouncementState["audienceMode"], rules: Api.Notification.AudienceRule[]) {
  if (mode === "all") return [{ type: "all" as const, includeDescendants: false }]
  if (!rules.length || rules.some((rule) => rule.type === "all" || !rule.value?.trim())) {
    throw new AnnouncementValidationError("audienceRequired")
  }
  return rules.map((rule) => ({
    type: rule.type,
    value: rule.value!.trim(),
    includeDescendants: rule.type === "department" && Boolean(rule.includeDescendants),
  }))
}

export function actualTemplateValues(rows: VariableRow[]) {
  const values: Record<string, string | number | boolean> = {}
  const missing: string[] = []
  const invalid: string[] = []
  for (const row of rows) {
    try {
      if (!variableTypes.includes(row.type)) throw new Error("unsupportedType")
      const value = exampleValue(row)
      if (value !== undefined) values[row.name] = value
      else if (row.required) missing.push(row.name)
    } catch {
      invalid.push(row.name)
    }
  }
  if (missing.length) throw new AnnouncementValidationError("variablesRequired", { names: missing.join("、") })
  if (invalid.length) throw new AnnouncementValidationError("variablesInvalid", { names: invalid.join("、") })
  return values
}

export function buildAnnouncementPayload(
  state: AnnouncementState,
  intent: "draft" | "publish",
  now = Date.now(),
): Api.Notification.AnnouncementUpdate {
  const { model } = state
  const fail = (key: string): never => {
    throw new AnnouncementValidationError(key)
  }
  if (!model.category.trim()) fail("categoryRequired")
  const banner = state.displayMode === "top_banner"
  if (banner && state.contentMode === "template" && state.variableRows.some((row) => row.source !== "manual"))
    fail("bannerManualOnly")
  const audience = normalizeAudience(banner ? "all" : state.audienceMode, state.audiences)
  let publishAt: string | null = null
  if (state.delivery === "scheduled") {
    if (!model.publishAt) fail("publishAtRequired")
    const value = parsePlatformTimeInput(model.publishAt!, state.originalTimes.publishAt)
    if (!value.isValid()) fail("publishAtInvalid")
    if (intent === "publish" && value.valueOf() <= now) fail("publishAtFuture")
    publishAt = value.toISOString()
  }
  let expireAt: string | null = null
  if (state.expires) {
    const value = parsePlatformTimeInput(model.expireAt || "", state.originalTimes.expireAt)
    const planned = publishAt ? Date.parse(publishAt) : now
    if (!value.isValid() || value.valueOf() <= Math.max(now, planned)) fail("expireAtInvalid")
    expireAt = value.toISOString()
  }
  const action = buildAnnouncementAction(state)
  const common = {
    displayMode: state.displayMode,
    replaceCurrent: false,
    replaceScheduled: false,
    category: model.category.trim(),
    level: model.level,
    audience,
    mandatory: banner ? false : model.mandatory,
    channels: banner ? [] : (["in_app"] as Api.Notification.Channel[]),
    rawFormat: model.rawFormat,
    action,
    publishAt,
    expireAt,
    saveAsDraft: intent === "draft" || (!banner && state.delivery === "now"),
  }
  if (state.contentMode === "template") {
    if (!model.templateCode) fail("templateRequired")
    return { ...common, templateCode: model.templateCode, ...announcementTemplateParameters(state.variableRows) }
  }
  if (state.contentMode === "local") {
    try {
      return { ...common, localizedContent: buildLocalizedContent(state.localized) }
    } catch (error) {
      if (error instanceof LocalizedValidationError) throw new AnnouncementValidationError(error.key, error.params)
      throw error
    }
  }
  if (state.contentMode === "i18n") {
    if (!/^[a-z][a-zA-Z0-9]*(?:[._-][a-zA-Z0-9]+)+$/.test(model.i18NKey)) fail("i18nKeyInvalid")
    let params: Record<string, unknown>
    try {
      params = parseObject(state.i18nParams)
    } catch {
      return fail("i18nParamsInvalid")
    }
    return { ...common, i18NKey: model.i18NKey, i18NParams: params }
  }
  if (!model.rawTitle.trim()) fail("titleRequired")
  if (!model.rawContent.trim()) fail("contentRequired")
  return { ...common, rawTitle: model.rawTitle, rawContent: model.rawContent, rawFormat: model.rawFormat }
}

/** UUID v4 also works on HTTP installations, where randomUUID is unavailable. */
export function createAnnouncementRequestId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6]! & 0x0f) | 0x40
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
