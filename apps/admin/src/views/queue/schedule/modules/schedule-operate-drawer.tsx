import { Switch } from "@rapidkit/ui/components/switch"
import { useCallback, useEffect, useRef, useState } from "react"
import { Controller, useForm, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"
import {
  Button,
  Input,
  Textarea,
  FieldGroup,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  toast,
} from "@rapidkit/ui"
import type { ScheduleRecord } from "@/services/api/schedule"
import { getAuthSession } from "@/services/auth-session"
import {
  loadSchedulePreview,
  scheduleAccess,
  useScheduleDetail,
  useScheduleOperations,
  useScheduleTasks,
} from "@/services/hooks/use-schedules"
import { FormField } from "@/shared/crud"
import { SearchableChoice } from "@/shared/crud/searchable-choice"
import {
  PythonArgumentsEditor,
  createArgumentDraft,
  parseArgumentDraft,
  type ArgumentDraft,
} from "@/shared/python-arguments/editor"
import { ScheduleEditor } from "@/shared/schedule-editor/editor"
import { createScheduleDraft, encodeSchedule, type ScheduleDraft } from "@/shared/schedule-editor/schedule-model"
import { useSchedulePreview } from "@/shared/schedule-editor/use-schedule-preview"
interface Values {
  name: string
  task: string
  description: string
  enabled: boolean
  arguments: ArgumentDraft
  schedule: ScheduleDraft
}
interface Props {
  record: ScheduleRecord | null
  onClose: () => void
  onSubmitted: () => void
}
function ScheduleForm({
  record,
  detail,
  registration,
  opening,
  onClose,
  onSubmitted,
}: {
  record: ScheduleRecord | null
  detail: ReturnType<typeof useScheduleDetail>
  registration: ReturnType<typeof useScheduleTasks>
  opening: string
  onClose: () => void
  onSubmitted: () => void
}) {
  const { t } = useTranslation(),
    [session] = useState(getAuthSession),
    alive = useRef(true),
    operations = useScheduleOperations(),
    [failed, setFailed] = useState(false),
    form = useForm<Values>({
      defaultValues: {
        name: detail.data?.name ?? "",
        task: detail.data?.task ?? "",
        description: detail.data?.description ?? "",
        enabled: detail.data?.enabled ?? true,
        arguments: createArgumentDraft(
          detail.data ? { args: detail.data.args ?? [], kwargs: detail.data.kwargs ?? {} } : undefined,
        ),
        schedule: createScheduleDraft(detail.data?.schedule),
      },
    }),
    draft = useWatch({ control: form.control, name: "schedule" }),
    task = useWatch({ control: form.control, name: "task" }),
    args = useWatch({ control: form.control, name: "arguments" }),
    load = useCallback(
      (value: Parameters<typeof loadSchedulePreview>[0]) => loadSchedulePreview(value, session),
      [session],
    ),
    preview = useSchedulePreview(draft, load, ["schedules", session, "editor", opening]),
    pending = form.formState.isSubmitting || operations.isPending(record?.id ?? "create"),
    registeredReady = registration.query.isSuccess && !registration.query.isFetching,
    detailReady = !record || (detail.isSuccess && !detail.isFetching),
    parsed = parseArgumentDraft(args)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  const submit = form.handleSubmit(async (values) => {
    setFailed(false)
    if (!detailReady) return
    const argumentsResult = parseArgumentDraft(values.arguments),
      schedule = encodeSchedule(values.schedule),
      snapshot = JSON.stringify(values)
    if (!argumentsResult.value) {
      form.setError("arguments", { message: t("schedule.argumentsInvalid") })
      return
    }
    if (!schedule.value) {
      form.setError("schedule", { message: t("scheduleEditor.invalid") })
      return
    }
    if (!registeredReady || !registration.tasks.includes(values.task)) {
      form.setError("task", { message: t("schedule.form.task") })
      return
    }
    const valid = await preview.validate()
    if (!valid) {
      if (alive.current) form.setError("schedule", { message: t("scheduleEditor.invalid") })
      return
    }
    if (
      !alive.current ||
      JSON.stringify(form.getValues()) !== snapshot ||
      !scheduleAccess(record ? "schedule:update" : "schedule:create", session)
    )
      return
    const accepted = await operations.save({
      id: record?.id,
      detailKey: record ? detail.key : undefined,
      registeredKey: registration.key,
      body: {
        name: values.name,
        task: values.task,
        description: values.description,
        enabled: values.enabled,
        ...argumentsResult.value,
        schedule: schedule.value,
      },
    })
    if (!alive.current) return
    if (accepted) {
      toast.success(t("schedule.saved"))
      onSubmitted()
      onClose()
    } else setFailed(true)
  })
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose()
      }}
    >
      <SheetContent className="data-[side=right]:w-full data-[side=right]:sm:max-w-[640px]" showCloseButton={!pending}>
        <SheetHeader className="shrink-0 border-b">
          <SheetTitle>{t(record ? "schedule.editSchedule" : "schedule.addSchedule")}</SheetTitle>
          <SheetDescription>{t("schedule.editorDescription")}</SheetDescription>
        </SheetHeader>
        <form
          noValidate
          id="schedule-form"
          className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-2"
          onSubmit={submit}
        >
          <FieldGroup>
            {record && detail.isError && (
              <div role="alert" className="space-y-2">
                <p>{t("schedule.argumentsLoadFailed")}</p>
                <Button type="button" variant="outline" disabled={pending} onClick={() => void detail.refetch()}>
                  {t("common.retry")}
                </Button>
              </div>
            )}
            <FormField
              htmlFor="schedule-name"
              label={t("schedule.name")}
              required
              error={form.formState.errors.name?.message}
            >
              <Input
                id="schedule-name"
                disabled={pending}
                {...form.register("name", { validate: (value) => Boolean(value.trim()) || t("schedule.form.name") })}
              />
            </FormField>
            <Controller
              name="task"
              control={form.control}
              rules={{ required: t("schedule.form.task") }}
              render={({ field, fieldState }) => (
                <FormField label={t("schedule.task")} required error={fieldState.error?.message}>
                  <SearchableChoice
                    label={t("schedule.task")}
                    value={field.value || null}
                    options={registration.tasks.map((value) => ({ value, label: value }))}
                    disabled={pending || !registeredReady}
                    loading={registration.query.isFetching}
                    onChange={(value) => field.onChange(value ?? "")}
                  />
                </FormField>
              )}
            />
            {registration.query.isError && (
              <div role="alert">
                <p>{t("schedule.registeredFailed")}</p>
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={() => void registration.query.refetch()}
                >
                  {t("common.retry")}
                </Button>
              </div>
            )}
            <FormField htmlFor="schedule-description" label={t("schedule.description")}>
              <Textarea id="schedule-description" disabled={pending} {...form.register("description")} />
            </FormField>
            <Controller
              name="enabled"
              control={form.control}
              render={({ field }) => (
                <FormField label={t("schedule.enabled")}>
                  <Switch
                    aria-label={t("schedule.enabled")}
                    checked={field.value}
                    disabled={pending}
                    onCheckedChange={field.onChange}
                  />
                </FormField>
              )}
            />
            <Controller
              name="arguments"
              control={form.control}
              render={({ field, fieldState }) => (
                <FormField label={t("schedule.arguments")} error={fieldState.error?.message}>
                  <PythonArgumentsEditor
                    value={field.value}
                    functionName={task || "task"}
                    disabled={pending}
                    onChange={(next) => {
                      field.onChange(next)
                      form.clearErrors("arguments")
                    }}
                  />
                </FormField>
              )}
            />
            <Controller
              name="schedule"
              control={form.control}
              render={({ field, fieldState }) => (
                <FormField label={t("scheduleEditor.title")} error={fieldState.error?.message}>
                  <ScheduleEditor
                    value={field.value}
                    preview={preview}
                    disabled={pending}
                    onChange={(next) => {
                      field.onChange(next)
                      form.clearErrors("schedule")
                    }}
                  />
                </FormField>
              )}
            />
            {failed && (
              <p role="alert" className="text-sm text-destructive">
                {t("schedule.operationFailed")}
              </p>
            )}
          </FieldGroup>
        </form>
        <SheetFooter className="shrink-0 border-t">
          <Button variant="outline" disabled={pending} onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            type="submit"
            form="schedule-form"
            disabled={pending || !registeredReady || !detailReady || !parsed.value}
          >
            {pending ? t("form.submitting") : t("common.save")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
export function ScheduleOperateDrawer({ record, onClose, onSubmitted }: Props) {
  const { t } = useTranslation(),
    [opening] = useState(() => crypto.randomUUID()),
    registration = useScheduleTasks(opening),
    detail = useScheduleDetail(record?.id ?? "", opening)
  if (!record || detail.data)
    return (
      <ScheduleForm
        record={record}
        detail={detail}
        registration={registration}
        opening={opening}
        onClose={onClose}
        onSubmitted={onSubmitted}
      />
    )
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <SheetContent className="data-[side=right]:w-full data-[side=right]:sm:max-w-[640px]">
        <SheetHeader>
          <SheetTitle>{t("schedule.editSchedule")}</SheetTitle>
          <SheetDescription>{t("schedule.editorDescription")}</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {detail.isError ? (
            <div role="alert" className="space-y-3">
              <p>{t("schedule.argumentsLoadFailed")}</p>
              <Button variant="outline" onClick={() => void detail.refetch()}>
                {t("common.retry")}
              </Button>
            </div>
          ) : (
            <p role="status">{t("common.loading")}</p>
          )}
        </div>
        <SheetFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button disabled>{t("common.save")}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
