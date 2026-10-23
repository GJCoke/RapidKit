import { useEffect } from "react"
import { Controller, useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import {
  FieldGroup,
  Input,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  toast,
} from "@rapidkit/ui"
import type { Role } from "@/services/api/role"
import { getAuthSession } from "@/services/auth-session"
import { requireRolePermission, useRoleMutations } from "@/services/hooks/use-roles"
import { CrudDrawer, FormField } from "@/shared/crud"

const defaults = { name: "", code: "", description: "", status: "1" as const }
export function RoleOperateDrawer({ role, onClose }: { role: Role | null; onClose: () => void }) {
  const { t } = useTranslation()
  const session = getAuthSession()
  const schema = z.object({
    name: z.string().trim().min(1, t("role.required")),
    code: z.string().trim().min(1, t("role.required")),
    description: z.string(),
    status: z.enum(["1", "2", "3"], { errorMap: () => ({ message: t("role.required") }) }),
  })
  type Values = z.infer<typeof schema>
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults })
  const { create, update } = useRoleMutations()
  useEffect(() => {
    form.reset(
      role ? { name: role.name, code: role.code, description: role.description, status: role.status } : defaults,
    )
  }, [form, role])
  const pending = create.isPending || update.isPending
  const submit = form.handleSubmit(async (values) => {
    try {
      requireRolePermission(role ? "role:update" : "role:create", session)
      if (role) await update.mutateAsync({ id: role.id, data: values })
      else await create.mutateAsync({ ...values, permissionCodes: [] })
      toast.success(t("role.saved"))
      onClose()
    } catch {
      /* request layer displays server errors; keep the draft */
    }
  })
  // Preserve existing backend states; new roles offer only enable/disable.
  const statuses: Array<{ value: Role["status"]; label: string; disabled?: boolean }> = [
    { value: "1", label: t("role.enabled") },
    { value: "2", label: t("role.disabled") },
    ...(role?.status === "3"
      ? [{ value: "3" as const, label: t("role.otherStatus", { status: "3" }), disabled: true }]
      : []),
  ]
  return (
    <CrudDrawer
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose()
      }}
      title={t(role ? "role.editRole" : "role.addRole")}
      description={t("role.description")}
      submitting={pending}
      onSubmit={() => void submit()}
    >
      <form onSubmit={submit}>
        <FieldGroup>
          {(["name", "code"] as const).map((name) => (
            <FormField
              key={name}
              htmlFor={`role-${name}`}
              label={t(name === "name" ? "role.roleName" : "role.roleCode")}
              required
              error={form.formState.errors[name]?.message}
            >
              <Input
                id={`role-${name}`}
                aria-invalid={!!form.formState.errors[name]}
                disabled={pending}
                {...form.register(name)}
              />
            </FormField>
          ))}
          <FormField htmlFor="role-description" label={t("role.roleDesc")}>
            <Textarea id="role-description" disabled={pending} {...form.register("description")} />
          </FormField>
          <Controller
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormField label={t("role.roleStatus")} required error={form.formState.errors.status?.message}>
                <Select items={statuses} value={field.value} onValueChange={field.onChange} disabled={pending}>
                  <SelectTrigger aria-label={t("role.roleStatus")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {statuses.map((item) => (
                        <SelectItem key={item.value} value={item.value} disabled={item.disabled}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </FormField>
            )}
          />
        </FieldGroup>
      </form>
    </CrudDrawer>
  )
}
