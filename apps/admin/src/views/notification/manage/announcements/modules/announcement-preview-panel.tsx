import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Badge, Button } from "@rapidkit/ui"
import { SearchableChoice } from "@/shared/crud/searchable-choice"
import { FormField } from "@/shared/crud"
import { notificationActionLabel } from "@/features/notifications/notification-model"
import type { useAnnouncementEditor } from "./use-announcement-editor"
import type { useAnnouncementPreviews } from "./use-announcement-previews"
import { announcementLocales, type AnnouncementLocale } from "./announcement-model"
import { announcementPreview } from "./announcement-preview"
import { AnnouncementSelect } from "./announcement-select"
export function AnnouncementPreviewPanel({
  editor,
  previews,
  locale,
  onLocaleChange,
  confirmation = false,
}: {
  editor: ReturnType<typeof useAnnouncementEditor>
  previews: ReturnType<typeof useAnnouncementPreviews>
  locale: AnnouncementLocale
  onLocaleChange: (locale: AnnouncementLocale) => void
  confirmation?: boolean
}) {
  const { t, i18n } = useTranslation(),
    { values, selectedTemplate, disabled, form } = editor
  const [expanded, setExpanded] = useState(true)
  const preview = announcementPreview(values, {
    locale: values.contentSource === "local" ? locale : i18n.language,
    template: selectedTemplate,
    rendered: previews.contentData,
    translate: (key, params) => t(key, params ?? {}),
  })
  const action = values.action,
    localLabels = values.contentSource === "local" && action.type !== "legacy"
  const label = notificationActionLabel(
    {
      label: action.label,
      ...(localLabels
        ? { localizedLabel: { defaultLocale: values.localized.defaultLocale, translations: action.labels } }
        : {}),
    },
    locale,
  )
  const markdown =
    values.contentSource === "template"
      ? selectedTemplate?.contentFormat === "markdown"
      : values.contentSource === "raw" && values.rawFormat === "markdown"
  return (
    <section className="grid min-w-0 gap-3 rounded-lg bg-muted/50 p-3">
      {!confirmation && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            {t("announcement.editor.preview")}
          </Button>
          {values.contentSource === "local" && (
            <AnnouncementSelect
              label={t("announcement.editor.localizedPreviewLanguage")}
              value={locale}
              options={announcementLocales.map((value) => ({
                value,
                label: t(`announcement.editor.localizedLanguages.${value}`),
              }))}
              disabled={disabled}
              onChange={(value) => {
                if (value === "zh-CN" || value === "en-US") onLocaleChange(value)
              }}
            />
          )}
        </div>
      )}
      {(expanded || confirmation) && (
        <>
          {previews.dynamic && values.displayMode !== "top_banner" && !confirmation && (
            <div className="grid gap-2 border-b pb-3">
              <FormField label={t("announcement.editor.previewUser")}>
                <SearchableChoice
                  label={t("announcement.editor.previewUser")}
                  value={values.previewUserId || null}
                  disabled={disabled || !previews.canUsers}
                  loading={previews.directories.users.isFetching}
                  options={(previews.directories.users.data ?? []).map((user) => ({
                    value: user.id,
                    label: `${user.name} · ${user.username}`,
                  }))}
                  placeholder={t("announcement.editor.previewUserPlaceholder")}
                  onChange={(value) => form.setValue("previewUserId", value ?? "")}
                />
              </FormField>
              <Button
                type="button"
                variant="outline"
                disabled={disabled || !previews.canPreview || !previews.canUsers || previews.contentLoading}
                onClick={() => void previews.previewContent()}
              >
                {previews.contentLoading ? t("common.loading") : t("announcement.editor.previewContent")}
              </Button>
              {(!previews.canPreview || !previews.canUsers) && (
                <p className="text-xs text-muted-foreground">{t("announcement.editor.contentPreviewForbidden")}</p>
              )}
              {previews.directories.users.isError && (
                <p role="alert" className="text-xs text-destructive">
                  {t("announcement.editor.previewUsersFailed")}{" "}
                  <Button
                    type="button"
                    variant="link"
                    disabled={disabled}
                    onClick={() => void previews.directories.users.refetch()}
                  >
                    {t("common.retry")}
                  </Button>
                </p>
              )}
              {previews.contentError && (
                <p role="alert" className="text-sm text-destructive">
                  {previews.contentError}
                </p>
              )}
              <p className="text-xs text-muted-foreground">{t("announcement.editor.recipientPreviewHint")}</p>
            </div>
          )}
          <div className="grid min-w-0 gap-2" aria-live="polite">
            <Badge variant={values.level === "error" ? "destructive" : "secondary"}>
              {t(`notification.level.${values.level}`)}
            </Badge>
            {previews.contentStale && (
              <p role="status" className="text-xs text-muted-foreground">
                {t("announcement.editor.contentPreviewAudienceChanged")}
              </p>
            )}
            <p className="break-words font-medium">{preview.title || t("announcement.editor.previewTitleEmpty")}</p>
            <p className="max-h-72 overflow-auto whitespace-pre-wrap break-words text-sm">
              {preview.content || t("announcement.editor.previewContentEmpty")}
            </p>
            {action.type !== "none" && label && <p className="break-words text-sm text-primary">{label}</p>}
            {localLabels && action.type !== "none" && !action.labels[locale].trim() && label && (
              <p className="text-xs text-muted-foreground">
                {t("announcement.editor.actionLabelFallback", {
                  locale: t(`announcement.editor.localizedLanguages.${values.localized.defaultLocale}`),
                })}
              </p>
            )}
            {markdown && (
              <p className="text-xs text-muted-foreground">{t("announcement.editor.markdownPreviewHint")}</p>
            )}
            {preview.issues.map((issue, index) => (
              <p key={`${issue.key}:${index}`} className="break-words text-xs text-muted-foreground">
                {t(`announcement.editor.${issue.key}`, issue.params ?? {})}
              </p>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
