import type { TreeSelectOption } from "naive-ui"
import { readLocalizedActionLabel } from "@/utils/notification/action-label"
import { notificationLocales } from "@/utils/notification/localized-content"
import { AnnouncementValidationError, parseObject } from "./announcement-editor"
import type { AnnouncementState } from "./announcement-editor"
import { countAnnouncementCharacters } from "./announcement-text-limits"

export function announcementActionLabels(
  state: AnnouncementState,
): Pick<Api.Notification.ActionInput, "label" | "localizedLabel"> {
  if (state.contentMode !== "local" || state.actionType === "legacy")
    return { label: state.model.actionLabel.trim() || null }
  const defaultLocale = state.localized.defaultLocale
  const translations: NonNullable<Api.Notification.ActionInput["localizedLabel"]>["translations"] = {}
  for (const locale of notificationLocales) {
    const value = state.actionLabels[locale].trim()
    if (countAnnouncementCharacters(state.actionLabels[locale]) > 64)
      throw new AnnouncementValidationError("actionLabelTooLong", { locale })
    if (value) translations[locale] = value
  }
  if (!translations[defaultLocale]) throw new AnnouncementValidationError("actionLabelDefaultRequired")
  return { label: translations[defaultLocale], localizedLabel: { defaultLocale, translations } }
}

/** Draft bindings intentionally omit route/path snapshots; the server resolves the current menu. */
export function buildAnnouncementAction(state: AnnouncementState): Api.Notification.ActionInput | null {
  if (!state.actionEnabled) return null
  const labels = announcementActionLabels(state)
  if (state.actionType === "external") {
    const url = state.actionUrl.trim()
    try {
      // oxlint-disable-next-line no-control-regex -- Reject URL controls before the browser can normalize them.
      if (!/^https?:\/\//i.test(url) || /[\s\\\u0000-\u001f\u007f]/.test(url)) throw new Error("invalidUrl")
      const parsed = new URL(url)
      if (!parsed.hostname || parsed.username || parsed.password) throw new Error("invalidUrl")
    } catch {
      throw new AnnouncementValidationError("actionUrlInvalid")
    }
    return { type: "external", url, ...labels }
  }
  if (state.actionType === "legacy") {
    const route = state.model.actionRoute.trim()
    if (!route) throw new AnnouncementValidationError("actionRouteRequired")
    let params: Record<string, unknown>
    try {
      params = parseObject(state.actionParams)
    } catch {
      throw new AnnouncementValidationError("actionParamsInvalid")
    }
    return { route, params, ...labels }
  }
  const menuId = state.actionMenuId?.trim()
  if (!menuId) throw new AnnouncementValidationError("actionMenuRequired")
  const params = Object.fromEntries(Object.entries(state.actionValues).map(([name, value]) => [name, value.trim()]))
  const query = Object.fromEntries(Object.entries(state.actionQuery).map(([name, value]) => [name, value.trim()]))
  // A saved binding may be absent from the directory (permissions, disabled page, load failure).
  // Keep every input so saving cannot silently discard data; the backend rechecks the binding.
  if (state.actionTarget?.menuId === menuId) {
    const descriptors = state.actionTarget.parameters ?? []
    const unknown = [
      ...Object.keys(params).filter((name) => !descriptors.some((row) => row.name === name && row.location === "path")),
      ...Object.keys(query).filter((name) => !descriptors.some((row) => row.name === name && row.location === "query")),
    ]
    if (unknown.length) throw new AnnouncementValidationError("actionParametersUnknown", { names: unknown.join("、") })
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
    if (missing.length) throw new AnnouncementValidationError("actionParametersRequired", { names: missing.join("、") })
  }
  return { type: "menu", menuId, params, query, ...labels }
}

function restoredValues(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value).map(([name, item]) => [name, typeof item === "string" ? item : (JSON.stringify(item) ?? "")]),
  )
}

/** Accept historic route actions and camel/snake case menu bindings from saved JSON. */
export function restoreAnnouncementAction(
  state: AnnouncementState,
  action: Record<string, unknown> | null | undefined,
): void {
  state.actionEnabled = Boolean(action)
  state.actionType = "menu"
  state.actionMenuId = null
  state.actionTarget = null
  state.actionValues = {}
  state.actionQuery = {}
  state.actionUrl = ""
  state.actionParams = "{}"
  state.model.actionRoute = "notification_center"
  state.model.actionLabel = typeof action?.label === "string" ? action.label : ""
  const localized = readLocalizedActionLabel(action)
  state.actionLabels = { "zh-CN": "", "en-US": "", ...localized?.translations }
  if (!localized && state.model.actionLabel) state.actionLabels[state.localized.defaultLocale] = state.model.actionLabel
  if (!action) return
  if (action.type === "external") {
    state.actionType = "external"
    state.actionUrl = typeof action.url === "string" ? action.url : ""
  } else if (action.type === "menu" || action.menuId || action.menu_id) {
    const menuId = action.menuId ?? action.menu_id
    state.actionMenuId = typeof menuId === "string" ? menuId : null
    state.actionValues = restoredValues(action.params)
    state.actionQuery = restoredValues(action.query)
  } else {
    state.actionType = "legacy"
    state.model.actionRoute = typeof action.route === "string" ? action.route : ""
    state.actionParams = JSON.stringify(action.params ?? {}, null, 2)
  }
}

/** Synthetic folder nodes are disabled: only actual page IDs can be selected. */
export function actionTargetTree(targets: Api.Notification.ActionTarget[]): TreeSelectOption[] {
  const roots: TreeSelectOption[] = []
  for (const target of targets) {
    const breadcrumb = [...target.breadcrumb]
    if (breadcrumb.at(-1) === target.label) breadcrumb.pop()
    let siblings = roots
    for (let index = 0; index < breadcrumb.length; index++) {
      const key = `directory:${JSON.stringify(breadcrumb.slice(0, index + 1))}`
      let folder = siblings.find((node) => node.key === key)
      if (!folder) {
        folder = { key, label: breadcrumb[index], disabled: true, children: [] }
        siblings.push(folder)
      }
      siblings = folder.children!
    }
    siblings.push({ key: target.menuId, label: target.label, disabled: false })
  }
  return roots
}
