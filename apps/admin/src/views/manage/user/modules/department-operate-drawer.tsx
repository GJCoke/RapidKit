import { useEffect, useRef, useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslation } from "react-i18next"
import { Button, FieldGroup, Input, toast } from "@rapidkit/ui"
import { usePermission } from "@/features/auth/permissions"
import { getAuthSession } from "@/services/auth-session"
import { requireDirectoryPermission } from "@/services/user-access"
import type { DepartmentTreeNode } from "@/services/api/department"
import { useDepartmentMutations } from "@/services/hooks/use-department-mutations"
import { useDepartmentOptions, useDirectoryUserOptions } from "@/services/hooks/use-user-options"
import { CrudDrawer, FormField } from "@/shared/crud"
import { FormSelect } from "@/shared/crud/form-select"
import { createDepartmentDirectory, departmentParentChoices } from "./department-directory"
import { departmentFormSchema, departmentPayload, type DepartmentFormValues } from "./department-form-schema"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  department?: DepartmentTreeNode | null
  parentId?: string | null
}
function DepartmentForm({ department, parentId, onSuccess, onOpenChange }: Props) {
  const { t } = useTranslation()
  const session = useRef(getAuthSession()).current
  const writes = useDepartmentMutations()
  const departments = useDepartmentOptions()
  const users = useDirectoryUserOptions()
  const busy = useRef(false)
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const [error, setError] = useState(false)
  const form = useForm<DepartmentFormValues>({
    resolver: zodResolver(departmentFormSchema),
    defaultValues: {
      parentId: department?.parentId ?? parentId ?? "",
      name: department?.name ?? "",
      code: department?.code ?? "",
      sort: department?.sort ?? 0,
      status: department?.status ?? "1",
      leaderId: department?.leaderId ?? "",
    },
  })
  const pending = writes.create.isPending || writes.update.isPending
  const parentChoices = departmentParentChoices(createDepartmentDirectory(departments.data ?? [], null), department?.id)
  const currentParent = form.getValues("parentId")
  if (currentParent && !parentChoices.some((item) => item.value === currentParent))
    parentChoices.push({ value: currentParent, label: t("users.department.currentParent", { id: currentParent }) })
  const leaders = (users.data ?? []).map((user) => ({ value: user.id, label: `${user.name} (${user.username})` }))
  const currentLeader = form.getValues("leaderId")
  if (currentLeader && !leaders.some((item) => item.value === currentLeader))
    leaders.push({ value: currentLeader, label: t("users.department.currentLeader", { id: currentLeader }) })
  const submit = form.handleSubmit(async (values) => {
    if (busy.current) return
    busy.current = true
    setError(false)
    try {
      const data = departmentPayload(values)
      if (department) await writes.update.mutateAsync({ id: department.id, data })
      else await writes.create.mutateAsync(data)
      if (!mounted.current) return
      requireDirectoryPermission(department ? "department:update" : "department:create", session)
      toast.success(t("users.department.saved"))
      onSuccess()
      onOpenChange(false)
    } catch {
      if (mounted.current) setError(true)
    } finally {
      busy.current = false
    }
  })
  return (
    <CrudDrawer
      open
      onOpenChange={onOpenChange}
      title={t(department ? "users.department.editTitle" : "users.department.addTitle")}
      description={t("users.department.description")}
      submitting={pending}
      onSubmit={() => void submit()}
    >
      <form onSubmit={submit}>
        <fieldset disabled={pending} className="min-w-0">
          <FieldGroup>
            <Controller
              control={form.control}
              name="parentId"
              render={({ field }) => (
                <FormField label={t("users.department.parent")}>
                  <FormSelect
                    label={t("users.department.parent")}
                    value={field.value || "none"}
                    options={[{ value: "none", label: t("users.department.noParent") }, ...parentChoices]}
                    onChange={(value) => field.onChange(value === "none" ? "" : value)}
                  />
                  {departments.isError && (
                    <div role="status" className="text-sm text-destructive">
                      {t("users.options.departmentsFailed")}
                      <Button type="button" size="sm" variant="ghost" onClick={() => void departments.refetch()}>
                        {t("users.options.retryDepartments")}
                      </Button>
                    </div>
                  )}
                </FormField>
              )}
            />
            <FormField
              label={t("users.department.name")}
              htmlFor="department-name"
              required
              error={form.formState.errors.name?.message ? t(form.formState.errors.name.message) : undefined}
            >
              <Input id="department-name" {...form.register("name")} />
            </FormField>
            <FormField
              label={t("users.department.code")}
              htmlFor="department-code"
              required
              error={form.formState.errors.code?.message ? t(form.formState.errors.code.message) : undefined}
            >
              <Input id="department-code" {...form.register("code")} />
            </FormField>
            <FormField
              label={t("users.department.sort")}
              htmlFor="department-sort"
              error={form.formState.errors.sort?.message ? t(form.formState.errors.sort.message) : undefined}
            >
              <Input id="department-sort" type="number" step="1" {...form.register("sort", { valueAsNumber: true })} />
            </FormField>
            <Controller
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormField label={t("users.department.status")}>
                  <FormSelect
                    label={t("users.department.status")}
                    value={field.value}
                    options={["1", "2", "3"].map((value) => ({ value, label: t(`users.status.${value}`) }))}
                    onChange={field.onChange}
                  />
                </FormField>
              )}
            />
            <Controller
              control={form.control}
              name="leaderId"
              render={({ field }) => (
                <FormField label={t("users.department.leader")}>
                  <FormSelect
                    label={t("users.department.leader")}
                    value={field.value || "none"}
                    options={[{ value: "none", label: t("users.department.noLeader") }, ...leaders]}
                    onChange={(value) => field.onChange(value === "none" ? "" : value)}
                  />
                  {users.isError && (
                    <div role="status" className="text-sm text-destructive">
                      {t("users.options.usersFailed")}
                      <Button type="button" size="sm" variant="ghost" onClick={() => void users.refetch()}>
                        {t("users.options.retryUsers")}
                      </Button>
                    </div>
                  )}
                </FormField>
              )}
            />
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {t("common.failed")}
              </p>
            )}
          </FieldGroup>
        </fieldset>
      </form>
    </CrudDrawer>
  )
}
export function DepartmentOperateDrawer(props: Props) {
  const allowed = usePermission(props.department ? "department:update" : "department:create")
  const session = getAuthSession()
  useEffect(() => {
    if (props.open && !allowed) props.onOpenChange(false)
  }, [allowed, props.open, props.onOpenChange])
  return props.open && allowed ? (
    <DepartmentForm key={`${session}:${props.department?.id ?? "new"}:${props.parentId ?? ""}`} {...props} />
  ) : null
}
