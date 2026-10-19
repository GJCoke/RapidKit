import { useAuthStore } from "@/store/modules/auth"
import type { ActionContext } from "./table-actions/types"

export function useAuth() {
  const authStore = useAuthStore()

  function hasAuth(codes: PermissionCode | PermissionCode[]) {
    if (!authStore.isLogin) {
      return false
    }

    // Admin users have all button permissions
    if (authStore.userInfo.isAdmin) {
      return true
    }

    if (typeof codes === "string") {
      return authStore.userInfo.buttons.includes(codes)
    }

    return codes.some((code) => authStore.userInfo.buttons.includes(code))
  }

  function getActionContext(locale = "zh-CN", isMobile = false): ActionContext {
    return {
      ready: authStore.isLogin && Boolean(authStore.userInfo.id),
      hasAuth,
      actorId: authStore.userInfo.id,
      isAdmin: authStore.userInfo.isAdmin,
      impersonating: Boolean(authStore.impersonation),
      locale,
      isMobile,
    }
  }

  return {
    hasAuth,
    getActionContext,
  }
}
