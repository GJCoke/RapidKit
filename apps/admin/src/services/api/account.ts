import { request } from "@/services/request"
import type { ApiRequest, ApiResponse } from "@/typings/service"

export type PasswordResetRequest = ApiRequest<"/api/v1/auth/password-reset/request", "post", "body">
export type PasswordResetConfirm = ApiRequest<"/api/v1/auth/password-reset/confirm", "post", "body">
export type SetPasswordBody = ApiRequest<"/api/v1/auth/invite/set-password", "post", "body">

export function fetchValidateInvite(token: string) {
  return request<ApiResponse<"/api/v1/auth/invite/validate">>({ url: "/auth/invite/validate", params: { token } })
}
export function fetchSetPassword(data: SetPasswordBody) {
  return request<ApiResponse<"/api/v1/auth/invite/set-password", "post">>({
    url: "/auth/invite/set-password",
    method: "post",
    data,
  })
}
export function fetchRequestPasswordReset(data: PasswordResetRequest) {
  return request<ApiResponse<"/api/v1/auth/password-reset/request", "post">>({
    url: "/auth/password-reset/request",
    method: "post",
    data,
  })
}
export function fetchValidatePasswordReset(token: string) {
  return request<ApiResponse<"/api/v1/auth/password-reset/validate">>({
    url: "/auth/password-reset/validate",
    params: { token },
  })
}
export function fetchConfirmPasswordReset(data: PasswordResetConfirm) {
  return request<ApiResponse<"/api/v1/auth/password-reset/confirm", "post">>({
    url: "/auth/password-reset/confirm",
    method: "post",
    data,
  })
}
