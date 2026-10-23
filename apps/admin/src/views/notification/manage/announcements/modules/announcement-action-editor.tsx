import { useEffect, useRef, useState } from "react"
import type { UseFormReturn } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { Badge, Button, Input, Textarea } from "@rapidkit/ui"
import { usePermission } from "@/features/auth"
import { useRouteStore } from "@/stores/route"
import { getAuthSession } from "@/services/auth-session"
import {
  previewAnnouncementAction,
  type AnnouncementActionPreview,
  type AnnouncementActionTarget,
} from "@/services/api/announcement"
import {
  announcementData,
  requireAnnouncementPermission,
  type useAnnouncementActionTargets,
} from "@/services/hooks/use-announcements"
import { resolveNotificationAction } from "@/features/notifications/notification-model"
import { FormField } from "@/shared/crud"
import { SearchableChoice } from "@/shared/crud/searchable-choice"
import { AnnouncementSelect } from "./announcement-select"
import {
  AnnouncementValidationError,
  announcementLocales,
  buildAnnouncementAction,
  type AnnouncementForm,
} from "./announcement-model"
function ActionPreview({
  form,
  target,
  disabled,
}: {
  form: UseFormReturn<AnnouncementForm>
  target: AnnouncementActionTarget | null
  disabled: boolean
}) {
  const { t } = useTranslation(),
    canPreview = usePermission("notification:preview"),
    session = useRef(getAuthSession()).current
  const [result, setResult] = useState<AnnouncementActionPreview | null>(null),
    [error, setError] = useState(""),
    [pending, setPending] = useState(false)
  const alive = useRef(true),
    lock = useRef(false)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  const current = () => alive.current && session === getAuthSession()
  const preview = async () => {
    if (disabled || !canPreview || lock.current) return
    lock.current = true
    setPending(true)
    setError("")
    setResult(null)
    try {
      requireAnnouncementPermission("notification:preview", session)
      const action = buildAnnouncementAction(form.getValues(), target)
      if (!action) return
      const data = await announcementData(previewAnnouncementAction(action))
      if (current()) {
        requireAnnouncementPermission("notification:preview", session)
        setResult(data)
      }
    } catch (error) {
      if (current())
        setError(
          error instanceof AnnouncementValidationError
            ? t(`announcement.editor.${error.key}`, error.params)
            : t("announcement.editor.actionPreviewFailed"),
        )
    } finally {
      lock.current = false
      if (alive.current) setPending(false)
    }
  }
  const destination = result ? resolveNotificationAction(result, useRouteStore.getState().snapshot) : null
  const open = () => {
    if (!result || disabled) return
    const destination = resolveNotificationAction(result, useRouteStore.getState().snapshot)
    if (!destination) {
      setError(t("announcement.editor.actionOpenFailed"))
      return
    }
    window.open(destination.href, "_blank", "noopener,noreferrer")
  }
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={disabled || !canPreview || pending}
          onClick={() => void preview()}
        >
          {pending ? t("common.loading") : t("announcement.editor.actionValidate")}
        </Button>
        <Button type="button" variant="outline" disabled={disabled || !result} onClick={open}>
          {t("announcement.editor.actionOpen")}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t("announcement.editor.actionValidationHint")}</p>
      {!canPreview && (
        <p className="text-xs text-muted-foreground">{t("announcement.editor.actionPreviewForbidden")}</p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {result && (
        <div role="status" className="grid gap-1 rounded-lg bg-muted p-3">
          <span>{t("announcement.editor.actionVerified")}</span>
          <code className="break-all text-xs">{destination?.href ?? result.url ?? result.path ?? result.route}</code>
        </div>
      )}
    </div>
  )
}
export function AnnouncementActionEditor({
  form,
  values,
  targets,
  target,
  disabled,
}: {
  form: UseFormReturn<AnnouncementForm>
  values: AnnouncementForm
  targets: ReturnType<typeof useAnnouncementActionTargets>
  target: AnnouncementActionTarget | null
  disabled: boolean
}) {
  const { t } = useTranslation(),
    canPreview = usePermission("notification:preview")
  const action = values.action,
    localized = values.contentSource === "local" && action.type !== "legacy"
  const choices = ["none", "menu", "external", ...(action.type === "legacy" ? ["legacy"] : [])].map((value) => ({
    value,
    label: t(
      `announcement.editor.action${value === "none" ? "None" : value === "menu" ? "Menu" : value === "external" ? "External" : "Legacy"}`,
    ),
  }))
  const parameters = target?.parameters ?? [
    ...Object.keys(action.params).map((name) => ({
      name,
      location: "path" as const,
      required: false,
      defaultValue: null,
      descriptionKey: null,
      example: null,
    })),
    ...Object.keys(action.query).map((name) => ({
      name,
      location: "query" as const,
      required: false,
      defaultValue: null,
      descriptionKey: null,
      example: null,
    })),
  ]
  const select = (menuId: string | null) => {
    const target = targets.data?.find((row) => row.menuId === menuId)
    const next = { ...action, menuId: menuId ?? "", params: {}, query: {}, label: action.label || target?.label || "" }
    next.params = Object.fromEntries(
      (target?.parameters ?? [])
        .filter((row) => row.location === "path")
        .map((row) => [row.name, row.defaultValue ?? ""]),
    )
    next.query = Object.fromEntries(
      (target?.parameters ?? [])
        .filter((row) => row.location === "query")
        .map((row) => [row.name, row.defaultValue ?? ""]),
    )
    if (localized && announcementLocales.every((locale) => !next.labels[locale]))
      next.labels = { ...next.labels, [values.localized.defaultLocale]: next.label }
    form.setValue("action", next, { shouldDirty: true })
  }
  return (
    <section className="grid min-w-0 gap-3">
      <FormField label={t("announcement.editor.actionType")}>
        <AnnouncementSelect
          label={t("announcement.editor.actionType")}
          value={action.type}
          options={choices}
          disabled={disabled}
          onChange={(type) => {
            if (type !== "none" && type !== "menu" && type !== "external" && type !== "legacy") return
            const next: AnnouncementForm["action"] = { ...action, type }
            if (type === "external") {
              if (!next.label) next.label = t("announcement.editor.actionExternalLabel")
              if (values.contentSource === "local" && announcementLocales.every((locale) => !next.labels[locale]))
                next.labels = {
                  "zh-CN": t("announcement.editor.actionExternalLabel", { lng: "zh-CN" }),
                  "en-US": t("announcement.editor.actionExternalLabel", { lng: "en-US" }),
                }
            }
            form.setValue("action", next, { shouldDirty: true })
          }}
        />
      </FormField>
      <p className="text-xs text-muted-foreground">{t("announcement.editor.actionChoiceHint")}</p>
      {action.type !== "none" && (
        <>
          {action.type === "menu" ? (
            <>
              <FormField label={t("announcement.editor.actionMenu")}>
                <SearchableChoice
                  label={t("announcement.editor.actionMenu")}
                  value={action.menuId || null}
                  disabled={disabled || !canPreview || targets.isError}
                  loading={targets.isFetching}
                  placeholder={t("announcement.editor.actionMenuPlaceholder")}
                  options={(targets.data ?? []).map((row) => ({
                    value: row.menuId,
                    label: row.label,
                    group: (row.breadcrumb.at(-1) === row.label ? row.breadcrumb.slice(0, -1) : row.breadcrumb).join(
                      " / ",
                    ),
                  }))}
                  onChange={select}
                />
              </FormField>
              {!canPreview ? (
                <p className="text-xs text-muted-foreground">{t("announcement.editor.actionDirectoryForbidden")}</p>
              ) : targets.isError ? (
                <p role="alert" className="text-sm text-destructive">
                  {t("announcement.editor.actionDirectoryFailed")}{" "}
                  <Button type="button" variant="link" disabled={disabled} onClick={() => void targets.refetch()}>
                    {t("common.retry")}
                  </Button>
                </p>
              ) : targets.isSuccess && !targets.data.length ? (
                <p className="text-xs text-muted-foreground">{t("announcement.editor.actionDirectoryEmpty")}</p>
              ) : null}
              {action.menuId && !target && !targets.isFetching && (
                <p className="break-all text-xs text-muted-foreground">
                  {t("announcement.editor.actionTargetUnavailable", { id: action.menuId })}
                </p>
              )}
              {target && (
                <div className="rounded-lg bg-muted p-3 text-xs">
                  <p>{target.breadcrumb.join(" / ")}</p>
                  <code className="break-all">{target.path}</code>
                </div>
              )}
              {parameters.map((parameter) => {
                const label = t(
                    `announcement.editor.${parameter.location === "path" ? "actionPathParameter" : "actionQueryParameter"}`,
                    { name: parameter.name },
                  ),
                  section = parameter.location === "path" ? "params" : "query"
                return (
                  <FormField
                    key={`${section}:${parameter.name}`}
                    label={label}
                    required={parameter.required}
                    description={t(
                      `announcement.editor.${parameter.location === "path" ? "actionPathDescription" : "actionQueryDescription"}`,
                      { name: parameter.name },
                    )}
                  >
                    <Input
                      aria-label={label}
                      disabled={disabled}
                      value={action[section][parameter.name] ?? ""}
                      placeholder={parameter.example ?? parameter.defaultValue ?? ""}
                      onChange={(event) =>
                        form.setValue(
                          `action.${section}`,
                          { ...action[section], [parameter.name]: event.target.value },
                          { shouldDirty: true },
                        )
                      }
                    />
                    {parameter.example && (
                      <p className="text-xs text-muted-foreground">
                        {t("announcement.editor.actionParameterExample", { value: parameter.example })}
                      </p>
                    )}
                    {parameter.defaultValue && (
                      <p className="text-xs text-muted-foreground">
                        {t("announcement.editor.actionParameterDefault", { value: parameter.defaultValue })}
                      </p>
                    )}
                  </FormField>
                )
              })}
            </>
          ) : action.type === "external" ? (
            <FormField label={t("announcement.editor.actionUrl")} description={t("announcement.editor.actionUrlHint")}>
              <Input
                aria-label={t("announcement.editor.actionUrl")}
                disabled={disabled}
                {...form.register("action.url")}
              />
            </FormField>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">{t("announcement.editor.actionLegacyHint")}</p>
              <FormField label={t("announcement.editor.actionRoute")}>
                <Input
                  aria-label={t("announcement.editor.actionRoute")}
                  disabled={disabled}
                  {...form.register("action.route")}
                />
              </FormField>
              <FormField label={t("announcement.editor.actionParams")}>
                <Textarea
                  aria-label={t("announcement.editor.actionParams")}
                  disabled={disabled}
                  {...form.register("action.legacyParams")}
                />
              </FormField>
            </>
          )}
          {localized ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {announcementLocales.map((locale) => (
                <FormField
                  key={locale}
                  label={t("announcement.editor.actionLabelLanguage", {
                    locale: t(`announcement.editor.localizedLanguages.${locale}`),
                  })}
                  required={locale === values.localized.defaultLocale}
                >
                  <Input
                    aria-label={t("announcement.editor.actionLabelLanguage", {
                      locale: t(`announcement.editor.localizedLanguages.${locale}`),
                    })}
                    disabled={disabled}
                    {...form.register(`action.labels.${locale}`)}
                  />
                  <Badge variant="secondary">
                    {t(
                      `announcement.editor.${locale === values.localized.defaultLocale ? "localizedDefaultBadge" : "actionParameterOptional"}`,
                    )}
                  </Badge>
                </FormField>
              ))}
              <p className="text-xs text-muted-foreground sm:col-span-2">
                {t("announcement.editor.actionLocalizedLabelHint")}
              </p>
            </div>
          ) : (
            <FormField label={t("announcement.editor.actionLabel")}>
              <Input
                aria-label={t("announcement.editor.actionLabel")}
                disabled={disabled}
                {...form.register("action.label")}
              />
            </FormField>
          )}
          <ActionPreview
            key={JSON.stringify([action, values.contentSource, values.localized.defaultLocale, target])}
            form={form}
            target={target}
            disabled={disabled}
          />
        </>
      )}
    </section>
  )
}
