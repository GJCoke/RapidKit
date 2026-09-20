import type { ReactNode } from "react"
import type { AuthUserInfo } from "@/services/api/auth"
import { useAuthStore } from "@/stores/auth"

export type PermissionCode = string | string[]

export function hasPermission(userInfo: AuthUserInfo | null, codes: PermissionCode) {
  if (!userInfo) return false
  if (userInfo.isAdmin) return true

  const requiredCodes = typeof codes === "string" ? [codes] : codes
  return requiredCodes.some((code) => userInfo.buttons.includes(code))
}

export function usePermission(codes: PermissionCode) {
  const token = useAuthStore((state) => state.token)
  const userInfo = useAuthStore((state) => state.userInfo)
  return Boolean(token) && hasPermission(userInfo, codes)
}

interface CanProps {
  permission: PermissionCode
  children: ReactNode
  fallback?: ReactNode
}

export function Can({ permission, children, fallback = null }: CanProps) {
  return usePermission(permission) ? children : fallback
}
