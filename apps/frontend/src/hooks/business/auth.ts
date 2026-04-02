import { useAuthStore } from "@/store/modules/auth"

export function useAuth() {
  const authStore = useAuthStore()

  function hasAuth(codes: string | string[]) {
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

  return {
    hasAuth,
  }
}
