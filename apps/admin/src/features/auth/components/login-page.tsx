import { useRef } from "react"
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router"
import { useTranslation } from "react-i18next"
import { useLogin } from "@/services/hooks/use-auth"
import { useAuthStore } from "@/stores/auth"
import { LoginForm, resolveAuthenticatedLoginRedirect } from "./login-form"
import { RequestRecovery, PasswordSetup } from "./account-forms"
import { getLoginCooldown, resolveLoginModule } from "../account-model"
import { useCooldown } from "../hooks/use-cooldown"
import { getAuthSession } from "@/services/auth-session"
import { ThemeToggle } from "@/features/layout/components/theme-toggle"
import { LocaleSwitch } from "@/features/locale/locale-switch"
import { toast } from "@rapidkit/ui"

export default function LoginPage() {
  const { t } = useTranslation()
  const token = useAuthStore((state) => state.token)
  const loginMutation = useLogin()
  const module = resolveLoginModule(useParams().module)
  const [query] = useSearchParams()
  const navigate = useNavigate()
  const cooldown = useCooldown(),
    busy = useRef(false)
  const authenticatedRedirect = resolveAuthenticatedLoginRedirect(token)

  const handleSubmit = (credentials: Parameters<typeof loginMutation.mutate>[0]) => {
    if (busy.current || cooldown.seconds > 0) return
    busy.current = true
    loginMutation.mutate(credentials, {
      onError: (error) => {
        const seconds = getLoginCooldown(error)
        if (seconds !== null) cooldown.start(seconds)
      },
      onSettled: () => {
        busy.current = false
      },
    })
  }

  if (module === "pwd-login" && authenticatedRedirect) return <Navigate to={authenticatedRedirect} replace />
  const back = () => navigate("/login")

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full min-w-0 max-w-md space-y-6 rounded-xl border border-border bg-card p-5 sm:p-8">
        <div className="flex justify-end gap-1">
          <LocaleSwitch />
          <ThemeToggle />
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-bold">{t("system.title")}</h1>
          {module === "pwd-login" && (
            <p className="mt-2 text-sm text-muted-foreground">{t("account.loginDescription")}</p>
          )}
        </div>

        {module === "pwd-login" ? (
          <LoginForm
            isPending={loginMutation.isPending}
            isError={loginMutation.isError}
            onSubmit={handleSubmit}
            cooldownSeconds={cooldown.seconds}
            onForgot={() => navigate("/login/reset-pwd")}
          />
        ) : module === "reset-pwd" ? (
          <RequestRecovery key={getAuthSession()} onBack={back} />
        ) : (
          <PasswordSetup
            mode={module}
            token={query.get("token") || ""}
            onBack={back}
            onRequestAgain={() => navigate("/login/reset-pwd")}
            onSuccess={() => {
              useAuthStore.getState().clearAuth()
              toast.success(t(module === "set-password" ? "account.activated" : "account.resetSuccess"))
              navigate("/login", { replace: true })
            }}
          />
        )}
      </div>
    </div>
  )
}

export const Component = LoginPage
