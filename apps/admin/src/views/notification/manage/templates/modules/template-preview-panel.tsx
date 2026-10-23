import { useTranslation } from "react-i18next"
import { templatePreview, type TemplateForm, type TemplateVariableRow } from "./template-model"
export function TemplatePreviewPanel({
  template,
  rows,
  detail = false,
  invalid = false,
}: {
  template: Pick<TemplateForm, "contentMode" | "titleTemplate" | "contentTemplate">
  rows: TemplateVariableRow[]
  detail?: boolean
  invalid?: boolean
}) {
  const { t } = useTranslation(),
    prefix = `notificationTemplate.${detail ? "list" : "editor"}`,
    preview = invalid
      ? { title: "", content: "", issues: [] }
      : templatePreview(template, rows, (key, params) => {
          // Template variable names are interpolation data, never i18next configuration.
          const value = t(key, {
            replace: params,
            returnObjects: true,
            returnDetails: false,
            ...(typeof params?.count === "number" ? { count: params.count } : {}),
          })
          return typeof value === "string" ? value : key
        }),
    groups = new Map<string, string[]>()
  for (const issue of preview.issues) groups.set(issue.kind, [...(groups.get(issue.kind) ?? []), issue.name])
  return (
    <section aria-label={t(`${prefix}.preview`)} className="grid min-w-0 gap-3 rounded-lg border bg-muted/30 p-4">
      <h3 className="font-semibold">{t(`${prefix}.preview`)}</h3>
      <p className="text-xs text-muted-foreground">{t(`${prefix}.previewHint`)}</p>
      <p className="whitespace-pre-wrap break-words font-medium">
        {preview.title || t(`${prefix}.${detail ? "emptyPreviewTitle" : "previewTitleEmpty"}`)}
      </p>
      <p className="whitespace-pre-wrap break-words text-sm">
        {preview.content || t(`${prefix}.${detail ? "emptyPreviewBody" : "previewContentEmpty"}`)}
      </p>
      {invalid && (
        <p role="alert" className="text-sm text-destructive">
          {t("notificationTemplate.editor.schemaInvalid")}
        </p>
      )}
      {Array.from(groups, ([kind, names]) => (
        <p key={kind} className="break-words text-sm text-amber-700 dark:text-amber-300">
          {t(`notificationTemplate.editor.previewSummary.${kind}`, {
            names: [...new Set(names)].join(t("notificationTemplate.editor.previewNameSeparator")),
          })}
        </p>
      ))}
    </section>
  )
}
