import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { LoaderCircle } from "lucide-react"
import { Button, Input } from "@rapidkit/ui"
import { FormField } from "@/shared/crud"
import {
  useAccountPassword,
  useAccountToken,
  useRequestRecovery,
  type AccountPasswordMode,
} from "@/services/hooks/use-account"
import { getAuthSession } from "@/services/auth-session"
import { useAuthStore } from "@/stores/auth"
import { createAccountPasswordSchema, createRecoveryEmailSchema } from "../account-model"
import { useCooldown } from "../hooks/use-cooldown"
import { PasswordInput } from "./password-input"

export function RequestRecovery({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation()
  const mutation = useRequestRecovery(),
    busy = useRef(false)
  const [submitted, setSubmitted] = useState(false)
  const cooldown = useCooldown()
  const form = useForm<{ email: string }>({
    resolver: zodResolver(
      createRecoveryEmailSchema({ required: t("account.emailRequired"), invalid: t("account.emailInvalid") }),
    ),
    defaultValues: { email: "" },
  })
  const submit = form.handleSubmit((values) => {
    if (busy.current || cooldown.seconds > 0) return
    busy.current = true
    mutation.mutate(values, {
      onSuccess: () => {
        setSubmitted(true)
        cooldown.start(60)
      },
      onSettled: () => {
        busy.current = false
      },
    })
  })
  return (
    <section className="space-y-5">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">{t("account.recoveryTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("account.recoveryDescription")}</p>
      </div>
      {submitted && (
        <p role="status" className="rounded-lg bg-muted p-3 text-sm">
          {t("account.sent")}
        </p>
      )}
      <form noValidate onSubmit={submit} className="space-y-4">
        <FormField
          label={t("account.email")}
          htmlFor="recovery-email"
          required
          error={form.formState.errors.email?.message}
          errorId="recovery-email-error"
        >
          <Input
            {...form.register("email")}
            id="recovery-email"
            type="email"
            autoComplete="email"
            disabled={mutation.isPending}
            aria-invalid={Boolean(form.formState.errors.email)}
            aria-describedby={form.formState.errors.email ? "recovery-email-error" : undefined}
          />
        </FormField>
        {mutation.isError && (
          <p role="alert" className="text-sm text-destructive">
            {t("account.failed")}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={mutation.isPending || cooldown.seconds > 0}>
          {mutation.isPending && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
          {cooldown.seconds > 0 ? t("account.sendAgain", { seconds: cooldown.seconds }) : t("account.send")}
        </Button>
        <Button type="button" variant="outline" className="w-full" onClick={onBack}>
          {t("account.back")}
        </Button>
      </form>
    </section>
  )
}
interface PasswordSetupProps {
  mode: AccountPasswordMode
  token: string
  onSuccess: () => void
  onBack: () => void
  onRequestAgain: () => void
}
export function PasswordSetup(props: PasswordSetupProps) {
  useAuthStore((state) => state.token)
  return <TokenSetup key={`${getAuthSession()}:${props.mode}:${props.token}`} {...props} />
}
function TokenSetup(props: PasswordSetupProps) {
  const { t } = useTranslation()
  const { mode, token, onBack, onRequestAgain } = props
  const query = useAccountToken(mode, token)
  return (
    <section className="space-y-5">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">
          {t(mode === "set-password" ? "account.inviteTitle" : "account.resetTitle")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t(mode === "set-password" ? "account.inviteDescription" : "account.resetDescription")}
        </p>
      </div>
      {token && query.isPending ? (
        <p role="status" className="flex items-center gap-2 text-sm">
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          {t(mode === "set-password" ? "account.checkingInvite" : "account.checkingReset")}
        </p>
      ) : query.isError ? (
        <div className="space-y-3">
          <p role="alert">{t("account.checkFailed")}</p>
          <Button
            variant="outline"
            onClick={() => {
              void query.refetch()
            }}
          >
            {t("common.retry")}
          </Button>
          <Button variant="ghost" onClick={onBack}>
            {t("account.back")}
          </Button>
        </div>
      ) : !token || query.data !== true ? (
        <div className="space-y-3">
          <p role="alert" className="text-sm text-destructive">
            {t(mode === "set-password" ? "account.invalidInvite" : "account.invalidReset")}
          </p>
          <Button variant="outline" className="w-full" onClick={mode === "set-password" ? onBack : onRequestAgain}>
            {t(mode === "set-password" ? "account.back" : "account.requestAgain")}
          </Button>
        </div>
      ) : (
        <AccountPasswordForm {...props} />
      )}
    </section>
  )
}
function AccountPasswordForm({ mode, token, onSuccess }: PasswordSetupProps) {
  const { t } = useTranslation()
  const mutation = useAccountPassword(mode, token),
    busy = useRef(false)
  const form = useForm<{ password: string; confirmPassword: string }>({
    resolver: zodResolver(
      createAccountPasswordSchema({
        required: t("auth.validation.passwordRequired"),
        invalid: t("auth.validation.passwordInvalid"),
        confirmRequired: t("account.confirmRequired"),
        mismatch: t("account.mismatch"),
      }),
    ),
    defaultValues: { password: "", confirmPassword: "" },
  })
  const submit = form.handleSubmit((values) => {
    if (busy.current) return
    busy.current = true
    mutation.mutate(values.password, {
      onSuccess,
      onSettled: () => {
        busy.current = false
      },
    })
  })
  return (
    <form noValidate onSubmit={submit} className="space-y-4">
      <fieldset disabled={mutation.isPending} className="space-y-4">
        <FormField
          label={t("account.newPassword")}
          htmlFor="account-password"
          required
          error={form.formState.errors.password?.message}
          errorId="account-password-error"
        >
          <PasswordInput
            {...form.register("password")}
            id="account-password"
            label={t("account.newPassword")}
            autoComplete="new-password"
            disabled={mutation.isPending}
            aria-invalid={Boolean(form.formState.errors.password)}
            aria-describedby={form.formState.errors.password ? "account-password-error" : undefined}
          />
        </FormField>
        <FormField
          label={t("account.confirmPassword")}
          htmlFor="account-confirm-password"
          required
          error={form.formState.errors.confirmPassword?.message}
          errorId="account-confirm-password-error"
        >
          <PasswordInput
            {...form.register("confirmPassword")}
            id="account-confirm-password"
            label={t("account.confirmPassword")}
            autoComplete="new-password"
            disabled={mutation.isPending}
            aria-invalid={Boolean(form.formState.errors.confirmPassword)}
            aria-describedby={form.formState.errors.confirmPassword ? "account-confirm-password-error" : undefined}
          />
        </FormField>
        {mode === "reset-password" && (
          <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">{t("account.sessionsInvalidated")}</p>
        )}
        {mutation.isError && (
          <p role="alert" className="text-sm text-destructive">
            {t("account.failed")}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={mutation.isPending}>
          {mutation.isPending && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
          {t(mode === "set-password" ? "account.activate" : "account.reset")}
        </Button>
      </fieldset>
    </form>
  )
}
