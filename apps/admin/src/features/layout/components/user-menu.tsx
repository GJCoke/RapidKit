import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { LogOut, VenetianMask } from "lucide-react"
import { Button } from "@rapidkit/ui/components/button"
import { Avatar, AvatarFallback } from "@rapidkit/ui/components/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@rapidkit/ui/components/dropdown-menu"
import { useAuthStore } from "@/stores/auth"
import { impersonationSession, useImpersonationStore } from "@/features/auth/impersonation-runtime"
import { hasImpersonationStorage } from "@/features/auth/impersonation-storage"

interface UserIdentity {
  name?: string | null
  username?: string | null
  email?: string | null
}

export function getUserDisplayName(userInfo: UserIdentity | null, fallback: string): string {
  return userInfo?.name?.trim() || userInfo?.username?.trim() || fallback
}

export function getUserInitial(userInfo: UserIdentity | null): string {
  return getUserDisplayName(userInfo, "U").slice(0, 1).toUpperCase()
}

export function UserMenu() {
  const { t, i18n } = useTranslation()
  const { userInfo, clearAuth } = useAuthStore()
  const { snapshot, transitionSession } = useImpersonationStore()
  const busy = transitionSession !== null
  const [now, setNow] = useState(Date.now)
  const [stopping, setStopping] = useState(false)
  const stoppingRef = useRef(false)
  useEffect(() => {
    if (!snapshot) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [snapshot])
  const displayName = getUserDisplayName(userInfo, t("layout.unknownUser"))

  const handleLogout = () => {
    if (snapshot || hasImpersonationStorage()) return
    clearAuth()
    window.location.href = "/login"
  }
  const stop = async () => {
    if (stoppingRef.current || busy) return
    stoppingRef.current = true
    setStopping(true)
    try {
      await impersonationSession.stop()
    } finally {
      stoppingRef.current = false
      setStopping(false)
    }
  }
  const seconds = snapshot ? Math.max(0, Math.floor((Date.parse(snapshot.expiresAt) - now) / 1000)) : 0
  const remaining = Number.isFinite(seconds)
    ? [Math.floor(seconds / 60), seconds % 60].map((value) => String(value).padStart(2, "0")).join(":")
    : "—"
  const expiresAt =
    snapshot && Number.isFinite(Date.parse(snapshot.expiresAt))
      ? new Date(snapshot.expiresAt).toLocaleString(i18n.resolvedLanguage, { hour12: false })
      : "—"

  return (
    <div className={snapshot ? "flex shrink-0 items-center gap-1 rounded-full bg-muted p-1" : "flex shrink-0"}>
      {snapshot && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="rounded-full"
          aria-label={t("users.impersonation.stop")}
          title={t("users.impersonation.stop")}
          disabled={busy || stopping}
          onClick={() => void stop()}
        >
          <VenetianMask className="size-4" aria-hidden="true" />
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger
          className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={t("layout.userMenu")}
        >
          <Avatar>
            <AvatarFallback>{getUserInitial(userInfo)}</AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-foreground">{displayName}</span>
                {userInfo?.email && <span className="text-xs text-muted-foreground">{userInfo.email}</span>}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {snapshot ? (
              <div className="space-y-3 px-2 py-2 text-xs">
                <p className="font-medium">{t("users.impersonation.active")}</p>
                <dl className="space-y-2">
                  <div className="flex justify-between gap-3">
                    <dt>{t("users.fields.username")}</dt>
                    <dd className="min-w-0 break-all text-right">@{snapshot.subject.username}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt>{t("users.impersonation.remaining")}</dt>
                    <dd aria-label={t("users.impersonation.remaining")} className="tabular-nums">
                      {remaining}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="shrink-0">{t("users.impersonation.expiresAt")}</dt>
                    <dd aria-label={t("users.impersonation.expiresAt")} className="min-w-0 text-right">
                      {expiresAt}
                    </dd>
                  </div>
                </dl>
                <p>{t("users.impersonation.restoreHint")}</p>
                <p className="text-muted-foreground">{t("users.impersonation.auditHint")}</p>
              </div>
            ) : (
              <DropdownMenuItem onClick={handleLogout}>
                <LogOut className="size-4" aria-hidden="true" />
                {t("auth.logout")}
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
