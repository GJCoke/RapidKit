import type { ApiResponse } from "@/typings/service"
import { refreshRequest } from "@/services/refresh-request"
import { request } from "@/services/request"

export interface LoginParams {
  username: string
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
  restrictedFields?: ApiResponse<"/api/v1/auth/user/info">["restrictedFields"]
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
  return request<string>({
    url: "/auth/keys/public",
  })
}

export type RefreshTokenResponse = ApiResponse<"/api/v1/auth/token/refresh", "post">

/** Rotate credentials using the refresh token, without ordinary auth recovery. */
export function fetchRefreshToken(refreshToken: string) {
  return refreshRequest<RefreshTokenResponse>({
    url: "/auth/token/refresh",
    method: "post",
    headers: { "X-Refresh-Token": refreshToken },
  })
}
