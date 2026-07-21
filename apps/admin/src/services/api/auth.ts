import { request } from "@/services/request"

interface LoginParams {
  userName: string
  password: string
}

interface LoginResponse {
  accessToken: string
  refreshToken: string
}

interface UserInfoResponse {
  id: string
  userName: string
  realName: string
  roles: string[]
}

export function fetchLogin(params: LoginParams) {
  return request<LoginResponse>({
    url: "/auth/login",
    method: "POST",
    data: params,
  })
}

export function fetchUserInfo() {
  return request<UserInfoResponse>({
    url: "/auth/user/info",
  })
}

export function fetchPublicKey() {
  return request<{ publicKey: string }>({
    url: "/auth/keys/public",
  })
}
