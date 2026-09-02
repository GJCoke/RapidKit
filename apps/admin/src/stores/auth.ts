import { create } from "zustand"
import type { AuthUserInfo } from "@/services/api/auth"
import { useRouteStore } from "@/stores/route"

interface AuthState {
  token: string
  refreshToken: string
  userInfo: AuthUserInfo | null
  setToken: (token: string, refreshToken: string) => void
  setUserInfo: (info: AuthUserInfo) => void
  clearAuth: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem("accessToken") || "",
  refreshToken: localStorage.getItem("refreshToken") || "",
  userInfo: null,
  setToken: (token, refreshToken) => {
    localStorage.setItem("accessToken", token)
    localStorage.setItem("refreshToken", refreshToken)
    set({ token, refreshToken })
  },
  setUserInfo: (userInfo) => set({ userInfo }),
  clearAuth: () => {
    localStorage.removeItem("accessToken")
    localStorage.removeItem("refreshToken")
    useRouteStore.getState().clearRoutes()
    set({ token: "", refreshToken: "", userInfo: null })
  },
}))
