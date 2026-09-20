import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { z } from "zod"

import { Button, Checkbox, Input, Label } from "@rapidkit/ui"

import type { LoginParams } from "@/services/api/auth"

const usernamePattern = /^[\u4E00-\u9FA5a-zA-Z0-9_-]{4,16}$/
const passwordPattern = /^\w{6,18}$/

interface LoginValidationMessages {
  usernameRequired: string
  usernameInvalid: string
  passwordRequired: string
  passwordInvalid: string
}

interface LoginFormValues {
  username: string
  password: string
  rememberMe: boolean
}

export function createLoginSchema(messages: LoginValidationMessages) {
  return z.object({
    username: z
      .string()
      .trim()
      .min(1, messages.usernameRequired)
      .refine((value) => value === "" || usernamePattern.test(value), messages.usernameInvalid),
    password: z
      .string()
      .min(1, messages.passwordRequired)
      .refine((value) => value === "" || passwordPattern.test(value), messages.passwordInvalid),
    rememberMe: z.boolean(),
  })
}

interface LoginFormProps {
  isPending: boolean
  isError: boolean
  onSubmit: (credentials: LoginParams) => void
}

export function resolveLoginSuccessPath() {
  return "/"
}

export function resolveAuthenticatedLoginRedirect(token: string) {
  return token ? resolveLoginSuccessPath() : null
}

export function LoginForm({ isPending, isError, onSubmit }: LoginFormProps) {
  const { t } = useTranslation()
  const schema = createLoginSchema({
    usernameRequired: t("auth.validation.usernameRequired"),
    usernameInvalid: t("auth.validation.usernameInvalid"),
    passwordRequired: t("auth.validation.passwordRequired"),
    passwordInvalid: t("auth.validation.passwordInvalid"),
  })
  const {
    control,
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      username: "",
      password: "",
      rememberMe: false,
    },
  })

  const handleValidatedSubmit = handleSubmit(({ username, password }) => {
    if (!isPending) onSubmit({ username, password })
  })

  return (
    <form onSubmit={handleValidatedSubmit} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="username">{t("auth.username")}</Label>
        <Input
          {...register("username")}
          id="username"
          type="text"
          autoComplete="username"
          placeholder="admin"
          disabled={isPending}
          aria-invalid={Boolean(errors.username)}
          aria-describedby={errors.username ? "username-error" : undefined}
        />
        {errors.username ? (
          <p id="username-error" role="alert" className="text-sm text-destructive">
            {errors.username.message}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">{t("auth.password")}</Label>
        <Input
          {...register("password")}
          id="password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          disabled={isPending}
          aria-invalid={Boolean(errors.password)}
          aria-describedby={errors.password ? "password-error" : undefined}
        />
        {errors.password ? (
          <p id="password-error" role="alert" className="text-sm text-destructive">
            {errors.password.message}
          </p>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <Controller
          control={control}
          name="rememberMe"
          render={({ field }) => (
            <Checkbox
              id="remember"
              name={field.name}
              ref={field.ref}
              checked={field.value}
              disabled={isPending}
              onBlur={field.onBlur}
              onCheckedChange={(value) => field.onChange(value === true)}
            />
          )}
        />
        <Label htmlFor="remember" className="text-sm font-normal">
          {t("auth.rememberMe")}
        </Label>
      </div>

      {isError ? (
        <p role="alert" className="text-sm text-destructive">
          {t("auth.loginFailed")}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? t("auth.loggingIn") : t("auth.login")}
      </Button>
    </form>
  )
}
