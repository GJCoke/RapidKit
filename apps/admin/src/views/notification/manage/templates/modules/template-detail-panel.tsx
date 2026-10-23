import { Badge, Button, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@rapidkit/ui"
import { useTranslation } from "react-i18next"
import type { NotificationTemplate } from "@/services/api/notification-template"
import { parseApiDate } from "@/shared/date-time"
import { templateSchemaRows, templateVariableTypes } from "./template-model"
import { TemplatePreviewPanel } from "./template-preview-panel"
export function TemplateDetailPanel({
  template,
  canEdit,
  canDelete,
  deleting,
  onEdit,
  onDelete,
}: {
  template: NotificationTemplate | null
  canEdit: boolean
  canDelete: boolean
  deleting: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const { t, i18n } = useTranslation(),
    p = "notificationTemplate.list.",
    rows = templateSchemaRows(template?.variableSchema ?? {})
  if (!template)
    return (
      <section
        aria-label={t(`${p}detail`)}
        className="grid min-w-0 content-center gap-2 rounded-lg border p-6 text-center"
      >
        <h2 className="font-semibold">{t(`${p}emptyTitle`)}</h2>
        <p className="text-sm text-muted-foreground">{t(`${p}emptyHint`)}</p>
      </section>
    )
  const date = template.updateTime ? parseApiDate(template.updateTime) : null,
    updated =
      date && !Number.isNaN(date.getTime())
        ? new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" }).format(date)
        : t(`${p}notSet`)
  return (
    <section
      id="template-details"
      aria-label={t(`${p}detail`)}
      className="grid min-w-0 content-start gap-5 rounded-lg border p-5"
    >
      <h2 className="font-semibold">{t(`${p}detail`)}</h2>
      <header className="grid min-w-0 gap-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="break-words text-xl font-semibold">{template.name}</h3>
            <p className="break-all font-mono text-xs text-muted-foreground">{template.code}</p>
          </div>
          <div className="flex gap-2">
            {canEdit && (
              <Button size="sm" variant="outline" onClick={onEdit}>
                {t("notificationTemplate.edit")}
              </Button>
            )}
            {canDelete && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={<Button variant="outline" size="sm" disabled={deleting} aria-label={t(`${p}more`)} />}
                >
                  •••
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem variant="destructive" disabled={deleting} onClick={onDelete}>
                    {t("common.delete")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{t(`${p}updatedAt`, { time: updated })}</p>
      </header>
      <section className="grid min-w-0 gap-3 border-t pt-4">
        <h3 className="font-semibold">{t(`${p}content`)}</h3>
        <p className="text-xs text-muted-foreground">
          {t(`${p}${template.contentMode === "raw" ? "rawMode" : "i18nMode"}`)}
          {template.contentMode === "raw" &&
            ` · ${t(`${p}${template.contentFormat === "markdown" ? "markdown" : "plainText"}`)}`}
        </p>
        <dl className="grid min-w-0 gap-3">
          {(["title", "body"] as const).map((kind) => (
            <div key={kind}>
              <dt className="text-xs text-muted-foreground">
                {t(
                  template.contentMode === "raw"
                    ? `${p}${kind}`
                    : `notificationTemplate.editor.${kind === "title" ? "titleKey" : "contentKey"}`,
                )}
              </dt>
              <dd className="whitespace-pre-wrap break-words text-sm">
                {(kind === "title" ? template.titleTemplate : template.contentTemplate) || t(`${p}notSet`)}
              </dd>
            </div>
          ))}
        </dl>
      </section>
      <TemplatePreviewPanel template={template} rows={rows} detail />
      <section className="grid min-w-0 gap-3 border-t pt-4">
        <h3 className="font-semibold">{t(`${p}parameters`)}</h3>
        <p className="text-xs text-muted-foreground">{t(`${p}parameterHint`)}</p>
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr>
                  {["parameter", "requirement", "exampleValue"].map((key) => (
                    <th className="p-2" key={key}>
                      {t(`${p}${key}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.name} className="border-t">
                    <td className="max-w-48 break-all p-2 font-mono">
                      {row.name}
                      <span className="block font-sans text-muted-foreground">
                        {templateVariableTypes.some((type) => type === row.type)
                          ? t(`notificationTemplate.editor.types.${row.type}`)
                          : row.type}
                      </span>
                    </td>
                    <td className="p-2">{t(`${p}${row.required ? "required" : "optional"}`)}</td>
                    <td className="max-w-48 whitespace-pre-wrap break-words p-2">{row.example || t(`${p}notSet`)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t(`${p}noParameters`)}</p>
        )}
      </section>
      <section className="grid min-w-0 gap-3 border-t pt-4">
        <h3 className="font-semibold">{t(`${p}rules`)}</h3>
        <dl className="grid gap-3 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">{t(`${p}channel`)}</dt>
            <dd>
              {template.defaultChannels.length
                ? template.defaultChannels
                    .map((channel) => (channel === "in_app" ? t(`${p}inApp`) : channel))
                    .join(", ")
                : t(`${p}noChannels`)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t(`${p}preference`)}</dt>
            <dd>
              {t(
                `${p}${template.mandatory ? "mandatoryPreference" : ["admin.announcement", "system.security"].includes(template.category) ? "reservedPreference" : "respectPreferences"}`,
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t(`${p}status`)}</dt>
            <dd>
              <Badge variant={template.enabled ? "default" : "secondary"}>
                {t(`${p}${template.enabled ? "enabled" : "disabled"}`)}
              </Badge>
            </dd>
          </div>
        </dl>
        <p className="text-xs text-muted-foreground">{t(`${p}${canEdit ? "editHint" : "readOnlyHint"}`)}</p>
      </section>
    </section>
  )
}
