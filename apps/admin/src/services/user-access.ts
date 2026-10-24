import type { PermissionCode } from "@/typings/permission-codes"
import { hasPermission } from "@/features/auth/permissions"
import { getAuthSession } from "@/services/auth-session"
import { useAuthStore } from "@/stores/auth"

export function requireDirectorySession(session: number) {
  if (session !== getAuthSession()) throw new Error("Directory editor session changed")
}
export function requireDirectoryPermission(code: PermissionCode, session: number) {
  requireDirectorySession(session)
  const actor = useAuthStore.getState()
  if (!actor.token || !hasPermission(actor.userInfo, code)) throw new Error("Directory operation permission revoked")
}
