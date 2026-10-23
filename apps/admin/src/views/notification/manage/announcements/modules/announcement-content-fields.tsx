import { useState } from "react"
import { Controller, type UseFormReturn } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { Badge, Input, Textarea, Tabs, TabsList, TabsTrigger, TabsContent, Button } from "@rapidkit/ui"
import { usePermission } from "@/features/auth"
import { FormField } from "@/shared/crud"
import { SearchableChoice } from "@/shared/crud/searchable-choice"
import type { useAnnouncementEditor } from "./use-announcement-editor"
import {
  announcementCharacters,
  announcementLocales,
  localizedParameterNames,
  recipientFields,
  type AnnouncementForm,
  type AnnouncementLocale,
} from "./announcement-model"
import { AnnouncementSelect } from "./announcement-select"

type ContentField = "rawTitle" | "rawContent" | `localized.translations.${AnnouncementLocale}.${"title" | "content"}`
function CountedContent({
  form,
  name,
  label,
  limit,
  disabled,
  required,
}: {
  form: UseFormReturn<AnnouncementForm>
  name: ContentField
  label: string
  limit: number
  disabled: boolean
  required: boolean
}) {
  return (
    <Controller
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormField label={label} required={required}>
          {limit === 256 ? (
            <Input
              {...field}
              aria-label={label}
              aria-required={required}
              disabled={disabled}
              onChange={(event) => field.onChange(Array.from(event.target.value).slice(0, limit).join(""))}
            />
          ) : (
            <Textarea
              {...field}
              aria-label={label}
              aria-required={required}
              disabled={disabled}
              className="min-h-28"
              onChange={(event) => field.onChange(Array.from(event.target.value).slice(0, limit).join(""))}
            />
          )}
          <span className="text-right text-xs tabular-nums text-muted-foreground">
            {announcementCharacters(field.value)}/{limit}
          </span>
        </FormField>
      )}
    />
  )
}
export function AnnouncementContentFields({
  editor,
  onLocaleChange,
}: {
  editor: ReturnType<typeof useAnnouncementEditor>
  onLocaleChange: (locale: AnnouncementLocale) => void
}) {
  const { t } = useTranslation(),
    { form, values, disabled, templates, selectedTemplate } = editor
  const canReadTemplates = usePermission("notification-template:read")
  const [activeLocale, setActiveLocale] = useState<AnnouncementLocale>(values.localized.defaultLocale)
  const templateOptions = [...(templates.data?.records ?? [])]
  if (selectedTemplate && !templateOptions.some((row) => row.code === selectedTemplate.code))
    templateOptions.unshift(selectedTemplate)
  const sources = [
    "raw",
    "template",
    "local",
    ...(values.contentSource === "i18n" || values.i18nKey ? ["i18n"] : []),
  ].map((value) => ({
    value,
    label: t(
      `announcement.editor.${value === "raw" ? "rawMode" : value === "template" ? "templateMode" : value === "local" ? "i18nMode" : "localizedLegacyMode"}`,
    ),
  }))
  const parameters = localizedParameterNames(values.localized.translations)
  return (
    <section className="grid min-w-0 gap-4">
      <div>
        <h2 className="font-semibold">{t("announcement.editor.contentHeading")}</h2>
        <p className="text-xs text-muted-foreground">{t("announcement.editor.contentHint")}</p>
      </div>
      <FormField label={t("announcement.editor.contentSource")}>
        <Controller
          control={form.control}
          name="contentSource"
          render={({ field }) => (
            <AnnouncementSelect
              label={t("announcement.editor.contentSource")}
              value={field.value}
              options={sources}
              disabled={disabled}
              onChange={field.onChange}
            />
          )}
        />
      </FormField>
      <div className="grid min-w-0 gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {values.contentSource === "raw" ? (
          <CountedContent
            form={form}
            name="rawTitle"
            label={t("announcement.editor.title")}
            limit={256}
            required
            disabled={disabled}
          />
        ) : values.contentSource === "template" ? (
          <FormField label={t("announcement.editor.template")} required>
            <SearchableChoice
              label={t("announcement.editor.template")}
              value={values.templateCode || null}
              options={templateOptions.map((row) => ({
                value: row.code,
                label: `${row.name} · ${row.code}`,
                disabled: !row.enabled,
              }))}
              loading={templates.isFetching}
              disabled={disabled || !canReadTemplates}
              placeholder={t("announcement.editor.templatePlaceholder")}
              onSearch={editor.searchTemplates}
              onChange={editor.chooseTemplate}
            />
          </FormField>
        ) : values.contentSource === "local" ? (
          <FormField label={t("announcement.editor.localizedDefaultLanguage")} required>
            <Controller
              control={form.control}
              name="localized.defaultLocale"
              render={({ field }) => (
                <AnnouncementSelect
                  label={t("announcement.editor.localizedDefaultLanguage")}
                  value={field.value}
                  options={announcementLocales.map((value) => ({
                    value,
                    label: `${t(`announcement.editor.localizedLanguages.${value}`)} · ${value}`,
                  }))}
                  disabled={disabled}
                  onChange={field.onChange}
                />
              )}
            />
          </FormField>
        ) : (
          <FormField label={t("announcement.editor.i18nKey")} required>
            <Input
              aria-label={t("announcement.editor.i18nKey")}
              disabled={disabled}
              maxLength={256}
              {...form.register("i18nKey")}
            />
          </FormField>
        )}
        <FormField label={t("announcement.editor.level")}>
          <Controller
            control={form.control}
            name="level"
            render={({ field }) => (
              <AnnouncementSelect
                label={t("announcement.editor.level")}
                value={field.value}
                options={["info", "success", "warning", "error"].map((value) => ({
                  value,
                  label: t(`notification.level.${value}`),
                }))}
                disabled={disabled}
                onChange={field.onChange}
              />
            )}
          />
        </FormField>
      </div>
      {values.contentSource === "raw" && (
        <CountedContent
          form={form}
          name="rawContent"
          label={t("announcement.editor.content")}
          limit={20_000}
          required
          disabled={disabled}
        />
      )}
      {values.contentSource === "template" && (
        <>
          <p className="text-xs text-muted-foreground">
            {t(`announcement.editor.${canReadTemplates ? "templateHint" : "templatesForbidden"}`)}
          </p>
          {templates.isError && (
            <p role="alert" className="text-sm text-destructive">
              {t("announcement.editor.templatesFailed")}{" "}
              <Button type="button" variant="link" disabled={disabled} onClick={() => void templates.refetch()}>
                {t("common.retry")}
              </Button>
            </p>
          )}
          {values.variables.map((variable, index) => {
            const example =
              variable.rule.example ?? (Array.isArray(variable.rule.examples) ? variable.rule.examples[0] : undefined)
            return (
              <div
                key={variable.name}
                className="grid min-w-0 gap-3 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)]"
              >
                <div className="min-w-0">
                  <p className="break-all font-medium">{variable.name}</p>
                  <span className="text-xs text-muted-foreground">
                    {variable.type} · {t(`announcement.editor.${variable.required ? "required" : "optional"}`)}
                  </span>
                </div>
                <FormField label={t("announcement.editor.valueSource")}>
                  <Controller
                    control={form.control}
                    name={`variables.${index}.source`}
                    render={({ field }) => (
                      <AnnouncementSelect
                        label={t("announcement.editor.valueSourceLabel", { name: variable.name })}
                        value={field.value}
                        options={[
                          { value: "manual", label: t("announcement.editor.valueSources.manual") },
                          ...recipientFields.map((value) => ({
                            value,
                            label: t(`announcement.editor.valueSources.${value}`),
                            disabled: variable.type !== "string" || values.displayMode === "top_banner",
                          })),
                        ]}
                        disabled={disabled}
                        onChange={field.onChange}
                      />
                    )}
                  />
                </FormField>
                <FormField label={t("announcement.editor.actualValue")} required={variable.required}>
                  {variable.source !== "manual" ? (
                    <p className="text-xs text-muted-foreground">{t("announcement.editor.dynamicValue")}</p>
                  ) : variable.type === "boolean" ? (
                    <Controller
                      control={form.control}
                      name={`variables.${index}.value`}
                      render={({ field }) => (
                        <AnnouncementSelect
                          label={t("announcement.editor.variableLabel", { name: variable.name })}
                          value={field.value || "none"}
                          options={[
                            { value: "none", label: t("common.noData") },
                            { value: "true", label: "true" },
                            { value: "false", label: "false" },
                          ]}
                          disabled={disabled}
                          onChange={(value) => field.onChange(value === "none" ? "" : value)}
                        />
                      )}
                    />
                  ) : (
                    <Input
                      aria-label={t("announcement.editor.variableLabel", { name: variable.name })}
                      disabled={disabled}
                      {...form.register(`variables.${index}.value`)}
                    />
                  )}
                  {variable.source === "manual" &&
                    example !== undefined &&
                    example !== null &&
                    String(example) !== "" && (
                      <p className="break-all text-xs text-muted-foreground">
                        {t("announcement.editor.exampleReference", { value: String(example) })}
                      </p>
                    )}
                </FormField>
              </div>
            )
          })}
          {selectedTemplate && !values.variables.length && (
            <p className="text-xs text-muted-foreground">{t("announcement.editor.noParameters")}</p>
          )}
          <p className="text-xs text-muted-foreground">{t("announcement.editor.variablesHint")}</p>
          {values.displayMode === "top_banner" && (
            <p className="text-xs text-muted-foreground">{t("announcement.editor.bannerManualOnly")}</p>
          )}
        </>
      )}
      {values.contentSource === "i18n" && (
        <FormField label={t("announcement.editor.i18nParams")} description={t("announcement.editor.i18nHint")}>
          <Textarea
            aria-label={t("announcement.editor.i18nParams")}
            disabled={disabled}
            {...form.register("i18nParams")}
          />
        </FormField>
      )}
      {values.contentSource === "local" && (
        <>
          <p className="text-xs text-muted-foreground">{t("announcement.editor.localizedHint")}</p>
          <Tabs
            value={activeLocale}
            onValueChange={(value) => {
              if (value === "zh-CN" || value === "en-US") {
                setActiveLocale(value)
                onLocaleChange(value)
              }
            }}
          >
            <TabsList aria-label={t("announcement.editor.localizedEditLanguage")} className="w-full">
              {announcementLocales.map((locale) => {
                const text = values.localized.translations[locale],
                  status =
                    locale === values.localized.defaultLocale
                      ? "localizedDefaultBadge"
                      : text.title.trim() && text.content.trim()
                        ? "localizedFilled"
                        : text.title.trim() || text.content.trim()
                          ? "localizedIncomplete"
                          : "localizedUnconfigured"
                return (
                  <TabsTrigger key={locale} value={locale} disabled={disabled}>
                    {t(`announcement.editor.localizedLanguages.${locale}`)}{" "}
                    <Badge variant="secondary">{t(`announcement.editor.${status}`)}</Badge>
                  </TabsTrigger>
                )
              })}
            </TabsList>
            {announcementLocales.map((locale) => (
              <TabsContent key={locale} value={locale} className="grid gap-3 pt-3">
                <CountedContent
                  form={form}
                  name={`localized.translations.${locale}.title`}
                  label={t("announcement.editor.localizedTitleLabel", { locale })}
                  limit={256}
                  disabled={disabled}
                  required={locale === values.localized.defaultLocale}
                />
                <CountedContent
                  form={form}
                  name={`localized.translations.${locale}.content`}
                  label={t("announcement.editor.localizedContentLabel", { locale })}
                  limit={20_000}
                  disabled={disabled}
                  required={locale === values.localized.defaultLocale}
                />
                <p className="text-xs text-muted-foreground">
                  {t("announcement.editor.localizedPlaceholderHint", { example: "{system}" })}
                </p>
              </TabsContent>
            ))}
          </Tabs>
          <div>
            <h3 className="font-medium">{t("announcement.editor.localizedParameters")}</h3>
            <p className="text-xs text-muted-foreground">{t("announcement.editor.localizedParametersHint")}</p>
          </div>
          {!parameters.length && (
            <p className="text-xs text-muted-foreground">{t("announcement.editor.localizedNoParameters")}</p>
          )}
          {parameters.map((name) => (
            <div
              key={name}
              className="grid min-w-0 gap-3 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_120px_minmax(0,1.5fr)]"
            >
              <code className="break-all">{`{${name}}`}</code>
              <Controller
                control={form.control}
                name={`localized.parameters.${name}.type`}
                defaultValue="string"
                render={({ field }) => (
                  <AnnouncementSelect
                    label={t("announcement.editor.localizedTypeLabel", { name })}
                    value={field.value}
                    options={["string", "number", "boolean"].map((value) => ({
                      value,
                      label: t(`announcement.editor.localizedTypes.${value}`),
                    }))}
                    disabled={disabled}
                    onChange={(value) => {
                      field.onChange(value)
                      if (value === "boolean")
                        form.setValue(`localized.parameters.${name}.value`, "true", { shouldDirty: true })
                    }}
                  />
                )}
              />
              {values.localized.parameters[name]?.type === "boolean" ? (
                <Controller
                  control={form.control}
                  name={`localized.parameters.${name}.value`}
                  render={({ field }) => (
                    <AnnouncementSelect
                      label={t("announcement.editor.variableLabel", { name })}
                      value={field.value ?? "true"}
                      options={[
                        { value: "true", label: t("announcement.editor.localizedTrue") },
                        { value: "false", label: t("announcement.editor.localizedFalse") },
                      ]}
                      disabled={disabled}
                      onChange={field.onChange}
                    />
                  )}
                />
              ) : (
                <Input
                  aria-label={t("announcement.editor.variableLabel", { name })}
                  disabled={disabled}
                  {...form.register(`localized.parameters.${name}.value`)}
                />
              )}
            </div>
          ))}
        </>
      )}
    </section>
  )
}
