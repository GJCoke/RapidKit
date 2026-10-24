import { create } from "zustand"
import type { AuthUserInfo } from "@/services/api/auth"
import { queryClient } from "@/services/query-client"
import { useRouteStore } from "@/stores/route"
import { useTabStore } from "@/stores/tab"
import { useRouteCacheStore } from "@/features/router/route-cache-store"
import { clearIdentityStorage, getCredentials, hasImpersonationStorage } from "@/features/auth/impersonation-storage"
import { recoverImpersonation } from "@/services/impersonation-recovery"

interface AuthState {
  token: string
  refreshToken: string
  userInfo: AuthUserInfo | null
  setToken: (token: string, refreshToken: string) => void
  setUserInfo: (info: AuthUserInfo) => void
  lastLogoutReason: LogoutReason | null
  clearAuth: (reason?: LogoutReason) => void
}

export type LogoutReason = "manual" | "expired" | "forced"

export const useAuthStore = create<AuthState>((set) => ({
  token: getCredentials().accessToken,
  refreshToken: getCredentials().refreshToken,
  userInfo: null,
  lastLogoutReason: null,
  setToken: (token, refreshToken) => {
    if (hasImpersonationStorage()) clearIdentityStorage()
    localStorage.setItem("accessToken", token)
    localStorage.setItem("refreshToken", refreshToken)
    set({ token, refreshToken })
  },
  setUserInfo: (userInfo) => set({ userInfo }),
  clearAuth: (reason = "manual") => {
    if (reason !== "manual") {
      const recovering = recoverImpersonation()
      if (recovering) {
        void recovering.catch(() => {})
        return
      }
    }
    clearIdentityStorage()
    useRouteStore.getState().clearRoutes()
    useTabStore.getState().clearTabs()
    useRouteCacheStore.getState().clear()
    queryClient.clear()
    set({ token: "", refreshToken: "", userInfo: null, lastLogoutReason: reason })
  },
}))
