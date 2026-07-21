import { create } from "zustand"

interface UserInfo {
  id: string
  userName: string
  realName: string
  roles: string[]
}

interface AuthState {
  token: string
  refreshToken: string
  userInfo: UserInfo | null
  setToken: (token: string, refreshToken: string) => void
  setUserInfo: (info: UserInfo) => void
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
    set({ token: "", refreshToken: "", userInfo: null })
  },
}))
