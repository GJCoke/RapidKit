import { useEffect, useId, useRef, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useTranslation } from "react-i18next"
import { Eye, EyeOff } from "lucide-react"
import { rsaEncrypt } from "@rapidkit/utils"
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  toast,
} from "@rapidkit/ui"
import { InputGroup, InputGroupInput, InputGroupAddon, InputGroupButton } from "@rapidkit/ui/components/input-group"
import { fetchPublicKey } from "@/services/api/auth"
import { getAuthSession } from "@/services/auth-session"
import { requireDirectoryPermission } from "@/services/user-access"
import { useChangeUserPassword } from "@/services/hooks/use-user-mutations"
import { useAuthStore } from "@/stores/auth"
import { usePermission } from "@/features/auth/permissions"
import { FormField } from "@/shared/crud"
import { canResetUserPassword } from "./user-eligibility"

type Values = { oldPassword: string; newPassword: string; confirmPassword: string }
interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string
  isSelf: boolean
}
function PasswordForm({ userId, onOpenChange, self }: Pick<Props, "userId" | "onOpenChange"> & { self: boolean }) {
  const { t } = useTranslation()
  const formId = useId()
  const session = useRef(getAuthSession()).current
  const active = useRef(false),
    busy = useRef(false)
  const [pending, setPending] = useState(false),
    [failed, setFailed] = useState(false)
  const [visible, setVisible] = useState<Partial<Record<keyof Values, boolean>>>({})
  const mutation = useChangeUserPassword()
  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
    }
  }, [])
  const schema = z
    .object({
      oldPassword: z.string(),
      newPassword: z.string().min(1, "users.password.requiredNew"),
      confirmPassword: z.string().min(1, "users.password.requiredConfirm"),
    })
    .superRefine((values, context) => {
      if (self && !values.oldPassword)
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["oldPassword"], message: "users.password.requiredOld" })
      if (values.confirmPassword && values.confirmPassword !== values.newPassword)
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["confirmPassword"], message: "users.password.mismatch" })
    })
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { oldPassword: "", newPassword: "", confirmPassword: "" },
  })
  function current() {
    if (!active.current) return false
    requireDirectoryPermission("user:reset-password", session)
    if (!canResetUserPassword(useAuthStore.getState().userInfo, userId, Boolean(localStorage.getItem("impersonation"))))
      throw new Error("Invalid password target")
    return true
  }
  const submit = form.handleSubmit(async (values) => {
    if (busy.current) return
    busy.current = true
    setPending(true)
    setFailed(false)
    try {
      if (!current()) return
      const key = await fetchPublicKey()
      if (!current()) return
      if (key.error || !key.data) throw key.error ?? new Error("Public key is unavailable")
      const newPassword = await rsaEncrypt(key.data, values.newPassword)
      if (!current()) return
      const oldPassword = self ? await rsaEncrypt(key.data, values.oldPassword) : undefined
      if (!current()) return
      await mutation.mutateAsync({ userId, data: { newPassword, ...(self ? { oldPassword } : {}) } })
      if (!current()) return
      toast.success(t("users.password.saved"))
      onOpenChange(false)
    } catch {
      if (active.current) setFailed(true)
    } finally {
      busy.current = false
      if (active.current) setPending(false)
    }
  })
  function passwordField(name: keyof Values) {
    const label = t(`users.password.${name}`)
    return (
      <FormField
        key={name}
        label={label}
        htmlFor={`${formId}-${name}`}
        required
        error={form.formState.errors[name]?.message ? t(form.formState.errors[name].message) : undefined}
      >
        <InputGroup>
          <InputGroupInput
            id={`${formId}-${name}`}
            type={visible[name] ? "text" : "password"}
            autoComplete={name === "oldPassword" ? "current-password" : "new-password"}
            aria-invalid={Boolean(form.formState.errors[name])}
            {...form.register(name)}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              type="button"
              size="icon-xs"
              aria-label={t(`users.password.${visible[name] ? "hide" : "show"}.${name}`)}
              onClick={() => setVisible((previous) => ({ ...previous, [name]: !previous[name] }))}
            >
              {visible[name] ? <EyeOff /> : <Eye />}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </FormField>
    )
  }
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("users.password.title")}</DialogTitle>
          <DialogDescription>{t("users.password.description")}</DialogDescription>
        </DialogHeader>
        <form id={formId} onSubmit={submit}>
          <fieldset disabled={pending} className="grid min-w-0 gap-4">
            {self && passwordField("oldPassword")}
            {passwordField("newPassword")}
            {passwordField("confirmPassword")}
            {failed && (
              <p role="alert" className="text-sm text-destructive">
                {t("common.failed")}
              </p>
            )}
          </fieldset>
        </form>
        <DialogFooter className="m-0 shrink-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" form={formId} disabled={pending}>
            {t(pending ? "form.submitting" : "common.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
export function ChangePasswordDialog(props: Props) {
  const actor = useAuthStore((state) => state.userInfo),
    token = useAuthStore((state) => state.token)
  const permitted = usePermission("user:reset-password")
  const allowed =
    Boolean(token) &&
    permitted &&
    canResetUserPassword(actor, props.userId, Boolean(localStorage.getItem("impersonation")))
  const session = getAuthSession()
  useEffect(() => {
    if (props.open && !allowed) props.onOpenChange(false)
  }, [allowed, props.open, props.onOpenChange])
  return props.open && allowed ? (
    <PasswordForm
      key={`${session}:${props.userId}`}
      userId={props.userId}
      onOpenChange={props.onOpenChange}
      self={actor?.id === props.userId}
    />
  ) : null
}
