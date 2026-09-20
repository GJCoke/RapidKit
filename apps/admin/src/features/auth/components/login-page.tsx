import { Navigate } from "react-router"
import { useTranslation } from "react-i18next"
import { useLogin } from "@/services/hooks/use-auth"
import { useAuthStore } from "@/stores/auth"
import { LoginForm, resolveAuthenticatedLoginRedirect } from "./login-form"

export default function LoginPage() {
  const { t } = useTranslation()
  const token = useAuthStore((state) => state.token)
  const loginMutation = useLogin()
  const authenticatedRedirect = resolveAuthenticatedLoginRedirect(token)

  const handleSubmit = (credentials: Parameters<typeof loginMutation.mutate>[0]) => {
    loginMutation.mutate(credentials)
  }

  if (authenticatedRedirect) return <Navigate to={authenticatedRedirect} replace />

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 rounded-lg border border-border p-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold">{t("system.title")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("auth.loginDescription", "Sign in to your account")}</p>
        </div>

        <LoginForm isPending={loginMutation.isPending} isError={loginMutation.isError} onSubmit={handleSubmit} />
      </div>
    </div>
  )
}

export const Component = LoginPage
