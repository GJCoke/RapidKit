import { useCallback, useEffect, useRef, useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
  Button,
  Checkbox,
  FieldGroup,
  Input,
  Textarea,
  toast,
} from "@rapidkit/ui"
import type { User, UsernamePinyinResult } from "@/services/api/user"
import { getAuthSession } from "@/services/auth-session"
import { requireDirectoryPermission } from "@/services/user-access"
import { hasRestrictedCreateFields } from "@/services/user-field-policy"
import { useCreateUser, useUpdateUser } from "@/services/hooks/use-user-mutations"
import { useDepartmentOptions, useRoleOptions } from "@/services/hooks/use-user-options"
import { useAuthStore } from "@/stores/auth"
import { usePermission } from "@/features/auth/permissions"
import { restrictedFieldsFor } from "@/features/auth/field-permissions"
import { CrudDrawer, FormField } from "@/shared/crud"
import { FormSelect } from "@/shared/crud/form-select"
import { buildUserCreateBody, buildUserUpdateBody, createUserFormSchema, type UserFormValues } from "./user-form-schema"
import { createDepartmentDirectory, departmentParentChoices } from "./department-directory"
import { useUsernamePinyin } from "../hooks/use-username-pinyin"

const emptyValues: UserFormValues = {
  name: "",
  username: "",
  email: "",
  phone: "",
  avatar: "",
  nickname: "",
  gender: "",
  status: "1",
  roles: [],
  isAdmin: false,
  departmentId: "",
  remark: "",
}
interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  user?: User | null
  onSuccess: () => void
  departmentId?: string | null
}
type TextFieldName = "name" | "username" | "email" | "phone" | "nickname" | "avatar" | "remark"
function UserForm({ user, departmentId, onSuccess, onOpenChange }: Props) {
  const { t } = useTranslation()
  const session = useRef(getAuthSession()).current
  const actor = useAuthStore((state) => state.userInfo)
  const restricted = restrictedFieldsFor(actor?.restrictedFields, "user")
  const roles = useRoleOptions(),
    departments = useDepartmentOptions()
  const create = useCreateUser(),
    update = useUpdateUser()
  const mounted = useRef(false),
    busy = useRef(false)
  const usernameInput = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState(false),
    [failed, setFailed] = useState(false)
  const [confirmation, setConfirmation] = useState<{
    values: UserFormValues
    result: UsernamePinyinResult | null
  } | null>(null)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const form = useForm<UserFormValues>({
    resolver: zodResolver(createUserFormSchema(user ? restricted : new Set())),
    defaultValues: user
      ? {
          name: user.name ?? "",
          username: user.username ?? "",
          email: user.email ?? "",
          phone: user.phone ?? "",
          avatar: user.avatar ?? "",
          nickname: user.nickname ?? "",
          gender: user.gender ?? "",
          status: user.status,
          roles: user.roles,
          isAdmin: user.isAdmin,
          departmentId: user.departmentId ?? "",
          remark: user.remark ?? "",
        }
      : { ...emptyValues, departmentId: departmentId ?? "" },
  })
  const inheritedDepartment = useRef(departmentId)
  useEffect(() => {
    const previous = inheritedDepartment.current
    inheritedDepartment.current = departmentId
    if (!user && previous && previous !== departmentId && form.getValues("departmentId") === previous) {
      form.setValue("departmentId", departmentId ?? "")
    }
  }, [departmentId, user, form])
  const name = useWatch({ control: form.control, name: "name" }),
    username = useWatch({ control: form.control, name: "username" })
  const suggestedUsername = useCallback((value: string) => form.setValue("username", value), [form])
  const pinyin = useUsernamePinyin(
    name,
    username,
    suggestedUsername,
    !restricted.has("name") && !restricted.has("username"),
    user ? "edit" : "add",
  )
  async function save(values: UserFormValues, verify: boolean) {
    if (busy.current) return
    busy.current = true
    setPending(true)
    setFailed(false)
    const snapshot = { ...values, roles: [...values.roles] }
    try {
      requireDirectoryPermission(user ? "user:update" : "user:create", session)
      if (verify) {
        const result = await pinyin.validateNow()
        if (!mounted.current) return
        requireDirectoryPermission(user ? "user:update" : "user:create", session)
        if (!result || !result.consistent) {
          setConfirmation({ values: snapshot, result })
          return
        }
      }
      const current = useAuthStore.getState().userInfo
      const policy = restrictedFieldsFor(current?.restrictedFields, "user")
      if (user)
        await update.mutateAsync({
          userId: user.id,
          data: buildUserUpdateBody(snapshot, policy, Boolean(current?.isAdmin)),
        })
      else await create.mutateAsync(buildUserCreateBody(snapshot, Boolean(current?.isAdmin), policy))
      if (!mounted.current) return
      requireDirectoryPermission(user ? "user:update" : "user:create", session)
      toast.success(t("users.saved"))
      onSuccess()
      onOpenChange(false)
    } catch {
      if (mounted.current) setFailed(true)
    } finally {
      busy.current = false
      if (mounted.current) setPending(false)
    }
  }
  const submit = form.handleSubmit((values) => save(values, true))
  const selectedRoles = useWatch({ control: form.control, name: "roles" })
  const roleChoices = (roles.data ?? []).map((role) => ({ value: role.code, label: role.name }))
  for (const code of selectedRoles)
    if (!roleChoices.some((item) => item.value === code)) roleChoices.push({ value: code, label: code })
  const departmentChoices = departmentParentChoices(createDepartmentDirectory(departments.data ?? [], null))
  const currentDepartment = form.getValues("departmentId")
  if (currentDepartment && !departmentChoices.some((item) => item.value === currentDepartment))
    departmentChoices.push({ value: currentDepartment, label: t("users.currentDepartment", { id: currentDepartment }) })
  const genderChoices = ["none", "male", "female", "other"].map((value) => ({
    value,
    label: t(`users.gender.${value}`),
  }))
  const currentGender = form.getValues("gender")
  if (currentGender && !genderChoices.some((item) => item.value === currentGender))
    genderChoices.push({ value: currentGender, label: t("users.gender.current", { value: currentGender }) })
  function textField(fieldName: TextFieldName) {
    const label = t(`users.fields.${fieldName}`),
      blocked = restricted.has(fieldName)
    return (
      <Controller
        key={fieldName}
        control={form.control}
        name={fieldName}
        render={({ field, fieldState }) => (
          <FormField
            label={label}
            htmlFor={`user-${fieldName}`}
            required={!blocked && ["name", "username", "email"].includes(fieldName)}
            error={fieldState.error?.message ? t(fieldState.error.message) : undefined}
            description={
              blocked
                ? t("users.restrictedField")
                : fieldName === "username" && pinyin.checking
                  ? t("users.pinyin.checking")
                  : undefined
            }
          >
            {fieldName === "remark" ? (
              <Textarea
                {...field}
                id={`user-${fieldName}`}
                value={blocked ? "" : field.value}
                disabled={blocked}
                placeholder={blocked ? t("users.restrictedField") : undefined}
              />
            ) : (
              <Input
                {...field}
                id={`user-${fieldName}`}
                type={fieldName === "email" ? "email" : "text"}
                value={blocked ? "" : field.value}
                disabled={blocked}
                placeholder={blocked ? t("users.restrictedField") : undefined}
                ref={(node) => {
                  field.ref(node)
                  if (fieldName === "username") usernameInput.current = node
                }}
                onChange={(event) => {
                  if (fieldName === "username") pinyin.markEdited()
                  field.onChange(event)
                }}
              />
            )}
            {fieldName === "username" && pinyin.consistent === false && (
              <p role="status" className="text-sm text-amber-600 dark:text-amber-400">
                {t("users.pinyin.warning", { username: pinyin.suggestedUsername })}
              </p>
            )}
            {fieldName === "username" && pinyin.failed && (
              <p role="status" className="text-sm text-muted-foreground">
                {t("users.pinyin.failed")}
              </p>
            )}
          </FormField>
        )}
      />
    )
  }
  return (
    <>
      <CrudDrawer
        open
        onOpenChange={onOpenChange}
        title={t(user ? "users.editTitle" : "users.addTitle")}
        description={t("users.formDescription")}
        submitting={pending}
        onSubmit={() => void submit()}
      >
        <form onSubmit={submit}>
          <fieldset disabled={pending} className="min-w-0">
            <FieldGroup>
              {!user && <p className="rounded-md bg-muted p-3 text-sm">{t("users.inviteNote")}</p>}
              {!user && hasRestrictedCreateFields(restricted) && (
                <p role="status" className="text-sm text-muted-foreground">
                  {t("users.restrictedCreate")}
                </p>
              )}
              {textField("name")}
              {textField("username")}
              {textField("email")}
              {textField("phone")}
              {textField("nickname")}
              {textField("avatar")}
              <Controller
                control={form.control}
                name="gender"
                render={({ field }) => (
                  <FormField label={t("users.fields.gender")}>
                    <FormSelect
                      label={t("users.fields.gender")}
                      value={field.value || "none"}
                      options={genderChoices}
                      onChange={(value) => field.onChange(value === "none" ? "" : value)}
                      disabled={restricted.has("gender")}
                    />
                  </FormField>
                )}
              />
              <Controller
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormField label={t("users.fields.status")}>
                    <FormSelect
                      label={t("users.fields.status")}
                      value={field.value}
                      options={["1", "2", "3"].map((value) => ({ value, label: t(`users.status.${value}`) }))}
                      onChange={field.onChange}
                      disabled={restricted.has("status")}
                    />
                  </FormField>
                )}
              />
              <Controller
                control={form.control}
                name="departmentId"
                render={({ field }) => (
                  <FormField label={t("users.fields.department")}>
                    <FormSelect
                      label={t("users.fields.department")}
                      value={field.value || "none"}
                      options={[{ value: "none", label: t("users.unassigned") }, ...departmentChoices]}
                      onChange={(value) => field.onChange(value === "none" ? "" : value)}
                      disabled={restricted.has("departmentId")}
                    />
                    {departments.isError && (
                      <div role="status" className="text-sm text-destructive">
                        {t("users.options.departmentsFailed")}
                        <Button type="button" variant="ghost" size="sm" onClick={() => void departments.refetch()}>
                          {t("users.options.retryDepartments")}
                        </Button>
                      </div>
                    )}
                  </FormField>
                )}
              />
              <Controller
                control={form.control}
                name="roles"
                render={({ field }) => (
                  <FormField label={t("users.fields.roles")}>
                    <div className="grid gap-2 rounded-md border p-3">
                      {roleChoices.map((item) => (
                        <label key={item.value} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={field.value.includes(item.value)}
                            disabled={restricted.has("roles")}
                            onCheckedChange={(checked) =>
                              field.onChange(
                                checked
                                  ? [...field.value, item.value]
                                  : field.value.filter((code) => code !== item.value),
                              )
                            }
                          />
                          {item.label}
                        </label>
                      ))}
                      {!roleChoices.length && (
                        <span className="text-sm text-muted-foreground">
                          {t(roles.isPending ? "common.loading" : "common.noData")}
                        </span>
                      )}
                    </div>
                    {roles.isError && (
                      <div role="status" className="text-sm text-destructive">
                        {t("users.options.rolesFailed")}
                        <Button type="button" variant="ghost" size="sm" onClick={() => void roles.refetch()}>
                          {t("users.options.retryRoles")}
                        </Button>
                      </div>
                    )}
                  </FormField>
                )}
              />
              {actor?.isAdmin && !restricted.has("isAdmin") && (
                <Controller
                  control={form.control}
                  name="isAdmin"
                  render={({ field }) => (
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} />
                      {t("users.fields.administrator")}
                    </label>
                  )}
                />
              )}
              {textField("remark")}
              {failed && (
                <p role="alert" className="text-sm text-destructive">
                  {t("common.failed")}
                </p>
              )}
            </FieldGroup>
          </fieldset>
        </form>
      </CrudDrawer>
      <AlertDialog
        open={Boolean(confirmation)}
        onOpenChange={(open) => {
          if (!open) setConfirmation(null)
        }}
      >
        <AlertDialogContent finalFocus={usernameInput}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t(confirmation?.result ? "users.pinyin.title" : "users.pinyin.failedTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmation?.result
                ? t("users.pinyin.description", {
                    current: confirmation.values.username,
                    suggested: confirmation.result.suggestedUsername,
                  })
                : t("users.pinyin.failedDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel render={<Button variant="outline" />}>{t("users.pinyin.return")}</AlertDialogCancel>
            <AlertDialogAction
              render={
                <Button
                  onClick={() => {
                    if (!confirmation) return
                    const values = confirmation.values
                    setConfirmation(null)
                    void save(values, false)
                  }}
                />
              }
            >
              {t("users.pinyin.submit")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
export function UserOperateDrawer(props: Props) {
  const allowed = usePermission(props.user ? "user:update" : "user:create")
  const session = getAuthSession()
  useEffect(() => {
    if (props.open && !allowed) props.onOpenChange(false)
  }, [allowed, props.open, props.onOpenChange])
  return props.open && allowed ? <UserForm key={`${session}:${props.user?.id ?? "new"}`} {...props} /> : null
}
