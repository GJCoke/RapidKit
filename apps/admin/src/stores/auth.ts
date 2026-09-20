import { create } from "zustand"
import type { AuthUserInfo } from "@/services/api/auth"
import { queryClient } from "@/services/query-client"
import { useRouteStore } from "@/stores/route"
import { useTabStore } from "@/stores/tab"
import { useRouteCacheStore } from "@/features/router/route-cache-store"

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
  token: localStorage.getItem("accessToken") || "",
  refreshToken: localStorage.getItem("refreshToken") || "",
  userInfo: null,
  lastLogoutReason: null,
  setToken: (token, refreshToken) => {
    localStorage.setItem("accessToken", token)
    localStorage.setItem("refreshToken", refreshToken)
    set({ token, refreshToken })
  },
  setUserInfo: (userInfo) => set({ userInfo }),
  clearAuth: (reason = "manual") => {
    localStorage.removeItem("accessToken")
    localStorage.removeItem("refreshToken")
    useRouteStore.getState().clearRoutes()
    useTabStore.getState().clearTabs()
    useRouteCacheStore.getState().clear()
    queryClient.clear()
    set({ token: "", refreshToken: "", userInfo: null, lastLogoutReason: reason })
  },
}))
