import { $t } from "@/locales"
import { exampleValue, previewTemplate } from "./template-editor"
import type { PreviewIssue, VariableRow } from "./template-editor"

type NotificationPreviewIssue = PreviewIssue | { kind: "translationMissing"; name: string }

function editorText(key: string, params: Record<string, unknown> = {}) {
  return $t(`page.notification.manage.templates.editor.${key}` as I18nFullKey, params)
}

function summarizeIssues(issues: NotificationPreviewIssue[]) {
  const groups = new Map<NotificationPreviewIssue["kind"], Set<string>>()
  for (const { kind, name } of issues) {
    if (!groups.has(kind)) groups.set(kind, new Set())
    groups.get(kind)!.add(name)
  }
  return [...groups].map(([kind, names]) =>
    editorText(`previewSummary.${kind}`, { names: [...names].join(editorText("previewNameSeparator")) }),
  )
}

export function renderTemplatePreview(
  template: Pick<Api.Notification.Template, "contentMode" | "titleTemplate" | "contentTemplate">,
  rows: VariableRow[],
) {
  if (template.contentMode === "raw") {
    const title = previewTemplate(template.titleTemplate, rows)
    const content = previewTemplate(template.contentTemplate, rows)
    return {
      title: title.text,
      content: content.text,
      issues: summarizeIssues([...title.issues, ...content.issues]),
    }
  }
  const issues: NotificationPreviewIssue[] = []
  const entries: [string, string | number | boolean][] = []
  for (const row of rows) {
    try {
      const value = exampleValue(row)
      if (value !== undefined) entries.push([row.name, value])
      else if (row.required) issues.push({ kind: "missingExample", name: row.name })
    } catch {
      issues.push({ kind: "invalidExample", name: row.name })
    }
  }
  const params = Object.fromEntries(entries)
  function translate(key: string) {
    if (!key) return ""
    const text = $t(key as I18nFullKey, params)
    if (text === key) issues.push({ kind: "translationMissing", name: key })
    return text
  }
  return {
    title: translate(template.titleTemplate),
    content: translate(template.contentTemplate),
    issues: summarizeIssues(issues),
  }
}
