import { useState } from "react"
import { useNavigate } from "react-router"
import { useTranslation } from "react-i18next"
import {
  Button,
  Input,
  Label,
  Checkbox,
  Separator,
  Badge,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@rapidkit/ui"
import { useLogin } from "@/services/hooks/use-auth"
import { HOME_PATH } from "@/features/router"

export default function LoginPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const loginMutation = useLogin()

  const [userName, setUserName] = useState("")
  const [password, setPassword] = useState("")
  const [remember, setRemember] = useState(false)
  const [language, setLanguage] = useState("zh-CN")

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    loginMutation.mutate(
      { userName, password },
      {
        onSuccess: () => {
          navigate(HOME_PATH, { replace: true })
        },
      },
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 rounded-lg border border-border p-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold">{t("system.title")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("auth.loginDescription", "Sign in to your account")}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">{t("auth.username")}</Label>
            <Input
              id="username"
              type="text"
              placeholder="admin"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">{t("auth.password")}</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Checkbox id="remember" checked={remember} onCheckedChange={(val) => setRemember(val as boolean)} />
              <Label htmlFor="remember" className="text-sm font-normal">
                {t("auth.rememberMe", "Remember me")}
              </Label>
            </div>
            <Badge variant="secondary">v0.1.0</Badge>
          </div>

          <Button type="button" variant="default" className="w-full">
            测试
          </Button>

          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" className="flex-1">
              {t("auth.register", "Register")}
            </Button>
            <Button type="button" variant="ghost" className="flex-1">
              {t("auth.forgotPassword", "Forgot?")}
            </Button>
          </div>
        </form>

        <Separator />

        <div className="space-y-2">
          <Label>{t("auth.language", "Language")}</Label>
          <Select value={language} onValueChange={(val) => val && setLanguage(val)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="zh-CN">中文</SelectItem>
                <SelectItem value="en-US">English</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )
}

export const Component = LoginPage
