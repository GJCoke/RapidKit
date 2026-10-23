import { z } from "zod"
import { renderNotification } from "@/features/notifications/notification-model"
import { formatTemplateText } from "@/features/notifications/template-preview"
import type { NotificationTemplate } from "@/services/api/notification-template"
import type { AnnouncementContentPreview } from "@/services/api/announcement"
import {
  AnnouncementValidationError,
  announcementLocalizedContent,
  announcementTemplateParameters,
  type AnnouncementForm,
} from "./announcement-model"

export interface AnnouncementPreviewIssue {
  key: string
  params?: Record<string, unknown>
}
export interface AnnouncementPreviewOptions {
  locale: string
  translate: (key: string, params?: Record<string, unknown> | null) => string
  template?: NotificationTemplate | null
  rendered?: AnnouncementContentPreview | null
}
export function announcementPreview(
  form: AnnouncementForm,
  { locale, translate, template, rendered }: AnnouncementPreviewOptions,
): { title: string; content: string; issues: AnnouncementPreviewIssue[] } {
  const translated = (title: string, content: string, contentParams: Record<string, unknown>) => {
    const text = renderNotification({ title, content, contentMode: "i18n", contentParams }, locale, translate)
    return {
      ...text,
      issues: title && (text.title === title || text.content === content) ? [{ key: "translationMissing" }] : [],
    }
  }
  if (form.contentSource === "raw") return { title: form.rawTitle, content: form.rawContent, issues: [] }
  try {
    if (form.contentSource === "local") {
      const parameters: Record<string, string | number | boolean> = Object.fromEntries(
        Object.entries(form.localized.parameters).flatMap<[string, string | number | boolean]>(([name, parameter]) => {
          if (!parameter.value.trim()) return []
          if (parameter.type === "string") return [[name, parameter.value]]
          if (parameter.type === "number" && Number.isFinite(Number(parameter.value)))
            return [[name, Number(parameter.value)]]
          if (parameter.type === "boolean" && ["true", "false"].includes(parameter.value))
            return [[name, parameter.value === "true"]]
          return []
        }),
      )
      const text = renderNotification(
        { title: "", content: "", contentMode: "local", contentParams: { ...form.localized, parameters } },
        locale,
        translate,
      )
      const issues: AnnouncementPreviewIssue[] = []
      try {
        announcementLocalizedContent(form)
      } catch (error) {
        if (error instanceof AnnouncementValidationError) issues.push({ key: error.key, params: error.params })
        else throw error
      }
      const requested = locale === "en-US" ? form.localized.translations["en-US"] : form.localized.translations["zh-CN"]
      if (!requested.title.trim() || !requested.content.trim())
        issues.push({
          key: "localizedFallback",
          params: { locale: translate(`announcement.editor.localizedLanguages.${form.localized.defaultLocale}`) },
        })
      return { ...text, issues }
    }
    if (form.contentSource === "template") {
      if (!template || template.code !== form.templateCode)
        return { title: "", content: "", issues: [{ key: "templatePreviewEmpty" }] }
      if (form.variables.some((row) => row.source !== "manual")) {
        if (!rendered) return { title: "", content: "", issues: [{ key: "personalizedPreviewEmpty" }] }
        return rendered.contentMode === "i18n"
          ? translated(rendered.title, rendered.content, rendered.contentParams ?? {})
          : { title: rendered.title, content: rendered.content, issues: [] }
      }
      const values = announcementTemplateParameters(form.variables).templateVariables
      if (template.contentMode === "i18n") return translated(template.titleTemplate, template.contentTemplate, values)
      const title = formatTemplateText(template.titleTemplate, values),
        content = formatTemplateText(template.contentTemplate, values)
      const names = [...new Set([...title.issues, ...content.issues])]
      return {
        title: title.text,
        content: content.text,
        issues: names.length ? [{ key: "previewUnresolved", params: { names: names.join("、") } }] : [],
      }
    }
    return translated(form.i18nKey, form.i18nKey, z.record(z.unknown()).parse(JSON.parse(form.i18nParams)))
  } catch (error) {
    return {
      title: "",
      content: "",
      issues: [
        error instanceof AnnouncementValidationError
          ? { key: error.key, params: error.params }
          : { key: "i18nParamsInvalid" },
      ],
    }
  }
}
