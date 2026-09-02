import { request } from "@/services/request"

interface LoginParams {
  userName: string
  password: string
}

export interface LoginResponse {
  accessToken: string
  refreshToken: string
}

export interface AuthUserInfo {
  id: string
  createTime: string
  updateTime: string
  name: string
  email: string
  username: string
  isAdmin: boolean
  roles: string[]
  buttons: string[]
}

export function fetchLogin(params: LoginParams) {
  return request<LoginResponse>({
    url: "/auth/login",
    method: "POST",
    data: params,
  })
}

export function fetchUserInfo() {
  return request<AuthUserInfo>({
    url: "/auth/user/info",
  })
}

export function fetchPublicKey() {
  return request<{ publicKey: string }>({
    url: "/auth/keys/public",
  })
}
