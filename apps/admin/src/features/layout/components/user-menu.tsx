import { useTranslation } from "react-i18next"
import { LogOut } from "lucide-react"
import { Avatar, AvatarFallback } from "@rapidkit/ui/components/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@rapidkit/ui/components/dropdown-menu"
import { useAuthStore } from "@/stores/auth"

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
  const { t } = useTranslation()
  const { userInfo, clearAuth } = useAuthStore()
  const displayName = getUserDisplayName(userInfo, t("layout.unknownUser"))

  const handleLogout = () => {
    clearAuth()
    window.location.href = "/login"
  }

  return (
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
        <DropdownMenuLabel>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-foreground">{displayName}</span>
            {userInfo?.email && <span className="text-xs text-muted-foreground">{userInfo.email}</span>}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout}>
          <LogOut className="size-4" aria-hidden="true" />
          {t("auth.logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
