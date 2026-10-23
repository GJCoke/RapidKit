import { Controller, useFieldArray, useWatch, type UseFormReturn } from "react-hook-form"
import { Button, Checkbox, Input, Textarea } from "@rapidkit/ui"
import { useTranslation } from "react-i18next"
import { FormSelect } from "@/shared/crud/form-select"
import {
  templateVariableTypes,
  templateRowsSchema,
  parseTemplateSchema,
  templateSchemaRows,
  type TemplateForm,
} from "./template-model"
export function TemplateVariablesEditor({ form, disabled }: { form: UseFormReturn<TemplateForm>; disabled: boolean }) {
  const { t } = useTranslation(),
    { fields, append, remove, replace } = useFieldArray({ control: form.control, name: "variables" }),
    json = useWatch({ control: form.control, name: "schemaJson" }),
    rows = useWatch({ control: form.control, name: "variables" })
  let error = false
  try {
    if (json === null) templateRowsSchema(rows)
    else parseTemplateSchema(json)
  } catch {
    error = true
  }
  const prefix = "notificationTemplate.editor."
  const toggle = () => {
    if (error) return
    if (json === null) {
      form.setValue("schemaJson", JSON.stringify(templateRowsSchema(form.getValues("variables")), null, 2), {
        shouldDirty: true,
      })
    } else {
      replace(templateSchemaRows(parseTemplateSchema(json)))
      form.setValue("schemaJson", null, { shouldDirty: true })
    }
  }
  return (
    <details open className="min-w-0 rounded-lg border p-4">
      <summary className="cursor-pointer font-semibold">{t(`${prefix}variables`)}</summary>
      <div className="mt-4 grid min-w-0 gap-3">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={disabled || error} onClick={toggle}>
            {t(`${prefix}${json === null ? "editJson" : "editTable"}`)}
          </Button>
          {json === null && (
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={() => append({ name: "", type: "string", required: false, example: "", rule: {} })}
            >
              {t(`${prefix}addVariable`)}
            </Button>
          )}
        </div>
        {json !== null ? (
          <>
            <Textarea
              aria-label={t("notificationTemplate.variableSchema")}
              className="min-h-48 font-mono"
              value={json}
              disabled={disabled}
              onChange={(event) => {
                const value = event.target.value
                form.setValue("schemaJson", value, { shouldDirty: true })
                try {
                  replace(templateSchemaRows(parseTemplateSchema(value)))
                } catch {
                  /* retain invalid JSON text until corrected */
                }
              }}
            />
            <p className="break-words text-xs text-muted-foreground">
              {t(`${prefix}jsonHint`, { schema: '{"name":{"type":"string","example":"Ada"}}' })}
            </p>
          </>
        ) : fields.length ? (
          <div className="grid min-w-0 gap-3">
            {fields.map((field, index) => (
              <div key={field.id} className="grid min-w-0 gap-3 rounded-lg border p-3 sm:grid-cols-2">
                <label className="grid gap-1 text-sm">
                  {t(`${prefix}variableName`)}
                  <Input
                    aria-label={`${t(`${prefix}variableName`)} ${index + 1}`}
                    disabled={disabled}
                    {...form.register(`variables.${index}.name`)}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  {t(`${prefix}variableType`)}
                  <Controller
                    control={form.control}
                    name={`variables.${index}.type`}
                    render={({ field }) => (
                      <FormSelect
                        label={`${t(`${prefix}variableType`)} ${index + 1}`}
                        value={field.value}
                        onChange={field.onChange}
                        disabled={disabled}
                        options={templateVariableTypes.map((value) => ({ value, label: t(`${prefix}types.${value}`) }))}
                      />
                    )}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  {t(`${prefix}exampleValue`)}
                  <Input
                    aria-label={`${t(`${prefix}exampleValue`)} ${index + 1}`}
                    disabled={disabled}
                    placeholder={t(`${prefix}examplePlaceholder`)}
                    {...form.register(`variables.${index}.example`)}
                  />
                </label>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-sm">
                    <Controller
                      control={form.control}
                      name={`variables.${index}.required`}
                      render={({ field }) => (
                        <Checkbox
                          checked={field.value}
                          disabled={disabled}
                          onCheckedChange={(value) => field.onChange(value === true)}
                        />
                      )}
                    />
                    {t(`${prefix}variableRequired`)}
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={disabled}
                    aria-label={`${t(`${prefix}removeVariable`)} ${index + 1}`}
                    onClick={() => remove(index)}
                  >
                    {t(`${prefix}removeVariable`)}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t(`${prefix}variablesEmpty`)}</p>
        )}
        <p className="text-xs text-muted-foreground">{t(`${prefix}exampleHint`)}</p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {t(`${prefix}schemaInvalid`)}
          </p>
        )}
      </div>
    </details>
  )
}
