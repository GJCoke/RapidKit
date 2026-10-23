import type { UseFormReturn } from "react-hook-form"
import { useFieldArray } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { Button, Checkbox, Input } from "@rapidkit/ui"
import { SearchableChoice, type ChoiceOption } from "@/shared/crud/searchable-choice"
import type { DepartmentTreeNode } from "@/services/api/department"
import type { useAnnouncementDirectories } from "@/services/hooks/use-announcements"
import { AnnouncementSelect } from "./announcement-select"
import type { AnnouncementForm } from "./announcement-model"
function departmentOptions(rows: DepartmentTreeNode[], parent = ""): ChoiceOption[] {
  return rows.flatMap((row) => {
    const label = parent ? `${parent} / ${row.name}` : row.name
    return [{ value: row.id, label }, ...departmentOptions(row.children ?? [], label)]
  })
}
export function AnnouncementAudienceEditor({
  form,
  values,
  directories,
  disabled,
}: {
  form: UseFormReturn<AnnouncementForm>
  values: AnnouncementForm
  directories: ReturnType<typeof useAnnouncementDirectories>
  disabled: boolean
}) {
  const { t } = useTranslation(),
    rules = useFieldArray({ control: form.control, name: "audiences" })
  const options = {
    role: directories.roles.data?.map((row) => ({ value: row.code, label: `${row.name} · ${row.code}` })) ?? [],
    user: directories.users.data?.map((row) => ({ value: row.id, label: `${row.name} · ${row.username}` })) ?? [],
    department: departmentOptions(directories.departments.data ?? []),
  }
  const queries = { role: directories.roles, user: directories.users, department: directories.departments }
  const permissions = { role: directories.canRoles, user: directories.canUsers, department: directories.canDepartments }
  return (
    <div className="grid min-w-0 gap-3">
      {rules.fields.map((field, index) => {
        const rule = values.audiences[index]
        if (!rule) return null
        const type = rule.type === "all" ? "user" : rule.type,
          query = queries[type],
          allowed = permissions[type]
        const label = t("announcement.editor.audienceValueLabel", { index: index + 1 })
        return (
          <div key={field.id} className="grid min-w-0 grid-cols-[100px_minmax(0,1fr)_auto] items-start gap-2">
            <AnnouncementSelect
              label={t("announcement.editor.audienceTypeLabel", { index: index + 1 })}
              value={rule.type}
              options={["department", "role", "user"].map((value) => ({
                value,
                label: t(`announcement.editor.audienceTypes.${value}`),
              }))}
              disabled={disabled}
              onChange={(type) => {
                if (type === "role" || type === "department" || type === "user")
                  rules.update(index, { type, value: "", includeDescendants: false })
              }}
            />
            <div className="grid min-w-0 gap-2">
              {allowed && !query.isError ? (
                <SearchableChoice
                  label={label}
                  value={rule.value ?? null}
                  options={options[type]}
                  loading={query.isFetching}
                  disabled={disabled}
                  placeholder={t(`announcement.editor.audiencePlaceholders.${type}`)}
                  onChange={(value) => form.setValue(`audiences.${index}.value`, value, { shouldDirty: true })}
                />
              ) : (
                <>
                  <Input
                    aria-label={label}
                    disabled={disabled}
                    placeholder={t(`announcement.editor.audienceIds.${type}`)}
                    {...form.register(`audiences.${index}.value`)}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t(`announcement.editor.${query.isError ? "directoryFailed" : "directoryForbidden"}`)}{" "}
                    {query.isError && (
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        disabled={disabled}
                        onClick={() => void query.refetch()}
                      >
                        {t("common.retry")}
                      </Button>
                    )}
                  </p>
                </>
              )}
              {type === "department" && (
                <label className="flex items-center gap-2 text-xs">
                  <Checkbox
                    checked={Boolean(rule.includeDescendants)}
                    disabled={disabled}
                    onCheckedChange={(checked) =>
                      form.setValue(`audiences.${index}.includeDescendants`, checked === true, { shouldDirty: true })
                    }
                  />
                  {t("announcement.editor.includeDescendants")}
                </label>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled || rules.fields.length === 1}
              aria-label={t("announcement.editor.removeAudience", { index: index + 1 })}
              onClick={() => rules.remove(index)}
            >
              ×
            </Button>
          </div>
        )
      })}
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => rules.append({ type: "user", value: "", includeDescendants: false })}
      >
        {t("announcement.editor.addAudience")}
      </Button>
      <p className="text-xs text-muted-foreground">{t("announcement.editor.audienceUnion")}</p>
    </div>
  )
}
