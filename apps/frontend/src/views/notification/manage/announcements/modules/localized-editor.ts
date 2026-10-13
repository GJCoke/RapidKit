import {
  localizedParameterNames,
  notificationLocales,
  readLocalizedContent,
  renderLocalizedContent,
} from "@/utils/notification/localized-content"
import type { NotificationLocale } from "@/utils/notification/localized-content"

export interface LocalizedParameter {
  type: "string" | "number" | "boolean"
  value: string
}
export interface LocalizedEditorState {
  defaultLocale: NotificationLocale
  activeLocale: NotificationLocale
  previewLocale: NotificationLocale
  translations: Record<NotificationLocale, { title: string; content: string }>
  parameters: Record<string, LocalizedParameter>
}
export class LocalizedValidationError extends Error {
  constructor(
    public key: string,
    public params: Record<string, unknown> = {},
  ) {
    super(key)
  }
}
export function createLocalizedEditor(): LocalizedEditorState {
  return {
    defaultLocale: "zh-CN",
    activeLocale: "zh-CN",
    previewLocale: "zh-CN",
    translations: { "zh-CN": { title: "", content: "" }, "en-US": { title: "", content: "" } },
    parameters: {},
  }
}
export function syncLocalizedParameters(state: LocalizedEditorState) {
  const names = localizedParameterNames(state.translations)
  const added = names.filter((name) => !Object.hasOwn(state.parameters, name))
  if (added.length)
    state.parameters = {
      ...state.parameters,
      ...Object.fromEntries(added.map((name) => [name, { type: "string", value: "" }])),
    }
  return names
}
function parameterValues(state: LocalizedEditorState, strict: boolean) {
  const missing: string[] = [],
    invalid: string[] = []
  const entries: [string, string | number | boolean][] = []
  for (const name of localizedParameterNames(state.translations)) {
    const parameter = Object.hasOwn(state.parameters, name) ? state.parameters[name] : undefined
    if (!parameter || !parameter.value.trim()) {
      missing.push(name)
      continue
    }
    if (parameter.type === "number") {
      const number = Number(parameter.value)
      if (!Number.isFinite(number)) invalid.push(name)
      else entries.push([name, number])
    } else if (parameter.type === "boolean") {
      if (!["true", "false"].includes(parameter.value)) invalid.push(name)
      else entries.push([name, parameter.value === "true"])
    } else entries.push([name, parameter.value])
  }
  if (strict && missing.length)
    throw new LocalizedValidationError("localizedValuesRequired", { names: missing.join("、") })
  if (strict && invalid.length)
    throw new LocalizedValidationError("localizedValuesInvalid", { names: invalid.join("、") })
  return Object.fromEntries(entries)
}
export function buildLocalizedContent(state: LocalizedEditorState): Api.Notification.LocalizedContent {
  const translations: Api.Notification.LocalizedContent["translations"] = {}
  for (const locale of notificationLocales) {
    const text = state.translations[locale]
    const full = Boolean(text.title.trim() && text.content.trim())
    if (!full && locale === state.defaultLocale) throw new LocalizedValidationError("localizedDefaultRequired")
    if (!full && (text.title.trim() || text.content.trim()))
      throw new LocalizedValidationError("localizedPartial", { locale })
    if (full) translations[locale] = { ...text }
  }
  return { defaultLocale: state.defaultLocale, translations, parameters: parameterValues(state, true) }
}
export function previewLocalizedEditor(state: LocalizedEditorState) {
  return renderLocalizedContent(
    { defaultLocale: state.defaultLocale, translations: state.translations, parameters: parameterValues(state, false) },
    state.previewLocale,
  )!
}
export function restoreLocalizedEditor(value: unknown): LocalizedEditorState {
  const state = createLocalizedEditor()
  const data = readLocalizedContent(value)
  if (!data) return state
  state.defaultLocale = data.defaultLocale as NotificationLocale
  state.activeLocale = state.previewLocale = state.defaultLocale
  for (const locale of notificationLocales)
    if (data.translations[locale]) state.translations[locale] = { ...data.translations[locale] }
  state.parameters = Object.fromEntries(
    Object.entries(data.parameters ?? {}).map(([name, value]) => [
      name,
      { type: typeof value as LocalizedParameter["type"], value: String(value) },
    ]),
  )
  syncLocalizedParameters(state)
  return state
}
