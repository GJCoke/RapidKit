import { useState } from "react"
import { Controller, useForm, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  FieldGroup,
  toast,
} from "@rapidkit/ui"
import { useTaskOperations, useTaskRegistration } from "@/services/hooks/use-tasks"
import { FormField } from "@/shared/crud/form-field"
import { SearchableChoice } from "@/shared/crud/searchable-choice"
import {
  PythonArgumentsEditor,
  createArgumentDraft,
  parseArgumentDraft,
  type ArgumentDraft,
} from "@/shared/python-arguments/editor"
interface Values {
  taskName: string
  arguments: ArgumentDraft
}
export function TriggerDialog({ onClose, onSubmitted }: { onClose: () => void; onSubmitted: () => void }) {
  const { t } = useTranslation(),
    [opening] = useState(() => crypto.randomUUID()),
    registration = useTaskRegistration(opening),
    operations = useTaskOperations(),
    form = useForm<Values>({ defaultValues: { taskName: "", arguments: createArgumentDraft() } }),
    [failed, setFailed] = useState(false),
    taskName = useWatch({ control: form.control, name: "taskName" }),
    draft = useWatch({ control: form.control, name: "arguments" }),
    parsed = parseArgumentDraft(draft),
    pending = form.formState.isSubmitting || operations.triggerPending
  const submit = form.handleSubmit(async (values) => {
    setFailed(false)
    const args = parseArgumentDraft(values.arguments)
    if (!args.value) {
      form.setError("arguments", { message: t("task.argumentsInvalid") })
      return
    }
    if (!registration.tasks.includes(values.taskName)) {
      form.setError("taskName", { message: t("task.registeredRequired") })
      return
    }
    const accepted = await operations.trigger({ taskName: values.taskName, ...args.value }, registration.key)
    if (accepted) {
      toast.success(t("task.triggerSuccess"))
      onSubmitted()
      onClose()
    } else setFailed(true)
  })
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose()
      }}
    >
      <DialogContent
        className="flex max-h-[calc(100dvh-32px)] max-w-[calc(100vw-32px)] flex-col overflow-hidden p-0 sm:max-w-[640px]"
        showCloseButton={!pending}
      >
        <DialogHeader className="border-b p-4">
          <DialogTitle>{t("task.triggerTask")}</DialogTitle>
          <DialogDescription>{t("task.selectTask")}</DialogDescription>
        </DialogHeader>
        <form id="trigger-task-form" className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4" onSubmit={submit}>
          <FieldGroup>
            <Controller
              name="taskName"
              control={form.control}
              rules={{ required: t("task.registeredRequired") }}
              render={({ field, fieldState }) => (
                <FormField label={t("task.taskName")} required error={fieldState.error?.message}>
                  <SearchableChoice
                    label={t("task.taskName")}
                    value={field.value || null}
                    clearable={false}
                    options={registration.tasks.map((value) => ({ value, label: value }))}
                    disabled={pending || registration.query.isFetching || registration.query.isError}
                    loading={registration.query.isFetching}
                    onChange={(value) => field.onChange(value ?? "")}
                  />
                </FormField>
              )}
            />
            {registration.query.isError && (
              <div role="alert" className="space-y-2 text-sm text-destructive">
                <p>{t("task.registeredFailed")}</p>
                <Button type="button" variant="outline" onClick={() => void registration.query.refetch()}>
                  {t("common.retry")}
                </Button>
              </div>
            )}
            <Controller
              name="arguments"
              control={form.control}
              render={({ field, fieldState }) => (
                <FormField label={t("task.args")} error={fieldState.error?.message}>
                  <PythonArgumentsEditor
                    value={field.value}
                    disabled={pending}
                    functionName={taskName || "task"}
                    onChange={(next) => {
                      field.onChange(next)
                      form.clearErrors("arguments")
                    }}
                  />
                </FormField>
              )}
            />
            {failed && (
              <p role="alert" className="text-sm text-destructive">
                {t("task.operationFailed")}
              </p>
            )}
          </FieldGroup>
        </form>
        <DialogFooter className="m-0 shrink-0 border-t p-4">
          <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            type="submit"
            form="trigger-task-form"
            disabled={pending || !parsed.value || registration.query.isFetching || registration.query.isError}
          >
            {pending ? t("form.submitting") : t("common.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
