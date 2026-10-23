import { useEffect, useRef, useState } from "react"
import { Controller, useForm } from "react-hook-form"
import {
  Button,
  Input,
  Textarea,
  Checkbox,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  toast,
} from "@rapidkit/ui"
import { useTranslation } from "react-i18next"
import { usePermission } from "@/features/auth"
import { useAuthStore } from "@/stores/auth"
import { getAuthSession } from "@/services/auth-session"
import type { NotificationTemplate } from "@/services/api/notification-template"
import { useNotificationTemplateWrites, requireTemplatePermission } from "@/services/hooks/use-notification-templates"
import { FormField } from "@/shared/crud"
import { FormSelect } from "@/shared/crud/form-select"
import { TemplateVariablesEditor } from "./template-variables-editor"
import { TemplatePreviewPanel } from "./template-preview-panel"
import {
  emptyTemplateForm,
  restoreTemplateForm,
  buildTemplatePayload,
  templateFormRows,
  insertTemplateVariable,
  TemplateValidationError,
  type TemplateForm,
  type TemplateVariableRow,
} from "./template-model"
export function TemplateOperateDrawer({
  template,
  onClose,
}: {
  template: NotificationTemplate | null
  onClose: () => void
}) {
  const { t } = useTranslation(),
    [original] = useState(template),
    session = useRef(getAuthSession()).current
  useAuthStore((state) => state.token)
  const permission = original ? "notification-template:update" : "notification-template:create",
    allowed = usePermission(permission),
    sameSession = session === getAuthSession(),
    prefix = "notificationTemplate.editor.",
    form = useForm<TemplateForm>({ defaultValues: original ? restoreTemplateForm(original) : emptyTemplateForm() }),
    values = form.watch()
  const writes = useNotificationTemplateWrites(),
    pending = writes.create.isPending || writes.update.isPending,
    flight = useRef(false),
    alive = useRef(true),
    [error, setError] = useState<{ key: string; params?: Record<string, unknown> } | null>(null)
  const titleRef = useRef<HTMLInputElement | null>(null),
    bodyRef = useRef<HTMLTextAreaElement | null>(null),
    active = useRef<{ field: "titleTemplate" | "contentTemplate"; start: number; end: number }>({
      field: "titleTemplate",
      start: 0,
      end: 0,
    })
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  useEffect(() => {
    if (!allowed || !sameSession) onClose()
  }, [allowed, sameSession, onClose])
  let rows: TemplateVariableRow[] = [],
    invalid = false
  try {
    rows = templateFormRows(values)
  } catch {
    invalid = true
  }
  const disabled = pending || !allowed || !sameSession
  const submit = form.handleSubmit(async (data) => {
    if (flight.current) return
    flight.current = true
    setError(null)
    try {
      requireTemplatePermission(permission, session)
      if (original) await writes.update.mutateAsync({ id: original.id, body: buildTemplatePayload(data, original) })
      else await writes.create.mutateAsync(buildTemplatePayload(data))
      if (!alive.current) return
      requireTemplatePermission(permission, session)
      toast.success(t("common.success"))
      onClose()
    } catch (cause) {
      if (alive.current && session === getAuthSession())
        setError(
          cause instanceof TemplateValidationError ? { key: cause.key, params: cause.params } : { key: "saveFailed" },
        )
    } finally {
      flight.current = false
    }
  })
  const insert = (name: string) => {
    if (disabled) return
    const selection = active.current,
      result = insertTemplateVariable(form.getValues(selection.field), selection, name)
    form.setValue(selection.field, result.value, { shouldDirty: true })
    const element = selection.field === "titleTemplate" ? titleRef.current : bodyRef.current
    requestAnimationFrame(() => {
      element?.focus()
      element?.setSelectionRange(result.cursor, result.cursor)
      active.current = { ...selection, start: result.cursor, end: result.cursor }
    })
  }
  const remember = (field: "titleTemplate" | "contentTemplate", element: HTMLInputElement | HTMLTextAreaElement) => {
    active.current = {
      field,
      start: element.selectionStart ?? element.value.length,
      end: element.selectionEnd ?? element.value.length,
    }
  }
  const title = form.register("titleTemplate"),
    body = form.register("contentTemplate")
  if (!allowed || !sameSession) return null
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open && !flight.current) onClose()
      }}
    >
      <SheetContent
        side="right"
        showCloseButton={!pending}
        className="flex h-full min-w-0 flex-col gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[760px]"
      >
        <SheetHeader className="border-b p-6">
          <SheetTitle>{t(`notificationTemplate.${original ? "edit" : "add"}`)}</SheetTitle>
          <SheetDescription>{t(`${prefix}intro`)}</SheetDescription>
        </SheetHeader>
        <form
          id="template-form"
          onSubmit={submit}
          noValidate
          className="grid min-h-0 min-w-0 flex-1 content-start gap-5 overflow-y-auto p-6"
        >
          <section className="grid min-w-0 gap-4">
            <h2 className="font-semibold">{t(`${prefix}basic`)}</h2>
            <FormField label={t(`${prefix}name`)} required description={t(`${prefix}nameHint`)}>
              <Input
                aria-label={t(`${prefix}name`)}
                placeholder={t(`${prefix}namePlaceholder`)}
                maxLength={128}
                disabled={disabled}
                {...form.register("name")}
              />
            </FormField>
            <FormField label={t(`${prefix}code`)} required description={t(`${prefix}codeHint`)}>
              <Input
                aria-label={t(`${prefix}code`)}
                maxLength={128}
                disabled={disabled || Boolean(original)}
                {...form.register("code")}
              />
            </FormField>
            <FormField label={t(`${prefix}category`)} required description={t(`${prefix}categoryHint`)}>
              <Input
                aria-label={t(`${prefix}category`)}
                placeholder={t(`${prefix}categoryPlaceholder`)}
                maxLength={128}
                list="template-categories"
                disabled={disabled}
                {...form.register("category")}
              />
              <datalist id="template-categories">
                {["admin.announcement", "system.security", "user.invited", "user.mention", "task.completed"].map(
                  (value) => (
                    <option value={value} key={value} />
                  ),
                )}
              </datalist>
            </FormField>
            <FormField label={t(`${prefix}level`)} required description={t(`${prefix}levelHint`)}>
              <Controller
                name="level"
                control={form.control}
                render={({ field }) => (
                  <FormSelect
                    label={t(`${prefix}level`)}
                    value={field.value}
                    onChange={field.onChange}
                    disabled={disabled}
                    options={["info", "success", "warning", "error"].map((value) => ({
                      value,
                      label: t(`notification.level.${value}`),
                    }))}
                  />
                )}
              />
            </FormField>
          </section>
          <section className="grid min-w-0 gap-4 border-t pt-4">
            <h2 className="font-semibold">{t(`${prefix}content`)}</h2>
            <FormField
              label={t(`${prefix}mode`)}
              required
              description={t(`${prefix}${values.contentMode === "raw" ? "rawHint" : "i18nHint"}`, {
                variable: "{username}",
              })}
            >
              <Controller
                name="contentMode"
                control={form.control}
                render={({ field }) => (
                  <FormSelect
                    label={t(`${prefix}mode`)}
                    value={field.value}
                    onChange={field.onChange}
                    disabled={disabled || Boolean(original)}
                    options={[
                      { value: "raw", label: t(`${prefix}rawMode`) },
                      { value: "i18n", label: t(`${prefix}i18nMode`) },
                    ]}
                  />
                )}
              />
              {original && <p className="text-xs text-muted-foreground">{t(`${prefix}modeLocked`)}</p>}
            </FormField>
            <FormField label={t(`${prefix}${values.contentMode === "raw" ? "titleTemplate" : "titleKey"}`)} required>
              <Input
                aria-label={t(`${prefix}${values.contentMode === "raw" ? "titleTemplate" : "titleKey"}`)}
                placeholder={t(
                  `${prefix}${values.contentMode === "raw" ? "titlePlaceholder" : "titleKeyPlaceholder"}`,
                  { task: "{task_name}" },
                )}
                maxLength={512}
                disabled={disabled}
                {...title}
                ref={(element) => {
                  title.ref(element)
                  titleRef.current = element
                }}
                onFocus={(event) => remember("titleTemplate", event.currentTarget)}
                onSelect={(event) => remember("titleTemplate", event.currentTarget)}
                onBlur={(event) => {
                  title.onBlur(event)
                  remember("titleTemplate", event.currentTarget)
                }}
              />
            </FormField>
            <FormField
              label={t(`${prefix}${values.contentMode === "raw" ? "contentTemplate" : "contentKey"}`)}
              required
            >
              <Textarea
                aria-label={t(`${prefix}${values.contentMode === "raw" ? "contentTemplate" : "contentKey"}`)}
                placeholder={t(
                  `${prefix}${values.contentMode === "raw" ? "contentPlaceholder" : "contentKeyPlaceholder"}`,
                  { variable: "{username}", task: "{task_name}" },
                )}
                className="min-h-32"
                maxLength={20000}
                disabled={disabled}
                {...body}
                ref={(element) => {
                  body.ref(element)
                  bodyRef.current = element
                }}
                onFocus={(event) => remember("contentTemplate", event.currentTarget)}
                onSelect={(event) => remember("contentTemplate", event.currentTarget)}
                onBlur={(event) => {
                  body.onBlur(event)
                  remember("contentTemplate", event.currentTarget)
                }}
              />
            </FormField>
            {values.contentMode === "raw" && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span>{t(`${prefix}insertVariable`)}</span>
                {rows.filter((row) => /^[A-Za-z_]\w*$/.test(row.name)).length ? (
                  rows
                    .filter((row) => /^[A-Za-z_]\w*$/.test(row.name))
                    .map((row, index) => (
                      <Button
                        key={`${row.name}-${index}`}
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={disabled || invalid}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => insert(row.name)}
                      >{`{${row.name}}`}</Button>
                    ))
                ) : (
                  <span className="text-muted-foreground">{t(`${prefix}insertEmpty`)}</span>
                )}
              </div>
            )}
          </section>
          <TemplateVariablesEditor form={form} disabled={disabled} />
          <TemplatePreviewPanel template={values} rows={rows} invalid={invalid} />
          <section className="grid min-w-0 gap-4 border-t pt-4">
            <h2 className="font-semibold">{t(`${prefix}rules`)}</h2>
            {(["enabled", "mandatory"] as const).map((name) => (
              <FormField key={name} label={t(`${prefix}${name}`)} description={t(`${prefix}${name}Hint`)}>
                <Controller
                  name={name}
                  control={form.control}
                  render={({ field }) => (
                    <Checkbox
                      aria-label={t(`${prefix}${name}`)}
                      checked={field.value}
                      disabled={disabled}
                      onCheckedChange={(checked) => field.onChange(checked === true)}
                    />
                  )}
                />
              </FormField>
            ))}
            {["admin.announcement", "system.security"].includes(values.category) && (
              <p className="text-xs text-muted-foreground">{t(`${prefix}reservedHint`)}</p>
            )}
            <p className="text-xs text-muted-foreground">{t(`${prefix}channelHint`)}</p>
          </section>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {t(
                `${prefix}${error.key === "undeclared" || error.key === "invalidFormat" ? `previewIssues.${error.key}` : error.key}`,
                error.params,
              )}
            </p>
          )}
        </form>
        <SheetFooter className="border-t p-4">
          <p className="text-xs text-muted-foreground">{t(`${prefix}createHint`)}</p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" disabled={disabled} onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" form="template-form" disabled={disabled}>
              {pending ? t("common.loading") : t(`${prefix}${original ? "save" : "create"}`)}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
