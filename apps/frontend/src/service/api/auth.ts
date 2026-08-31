import { request } from "../request"

/** login */
export function fetchLogin(data: Api.Auth.LoginBody) {
  return request<Api.Auth.LoginToken>({
    url: "/auth/login",
    method: "POST",
    data,
  })
}

/** Get user info */
export function fetchGetPublicKey() {
  return request<Api.Auth.PublicKey>({ url: "/auth/keys/public" })
}

/** Get user info */
export function fetchGetUserInfo() {
  return request<Api.Auth.UserInfo>({ url: "/auth/user/info" })
}

/** Validate an invite token without consuming it */
export function fetchValidateInvite(token: string) {
  return request<Api.Auth.InviteValidate>({
    url: "/auth/invite/validate",
    method: "get",
    params: { token },
  })
}

/** Set a password and activate an invited account */
export function fetchSetPassword(data: Api.Auth.SetPasswordBody) {
  return request<boolean>({
    url: "/auth/invite/set-password",
    method: "post",
    data,
  })
}

/** Request a password-reset email without disclosing account state */
export function fetchRequestPasswordReset(data: Api.Auth.PasswordResetRequestBody) {
  return request<boolean>({ url: "/auth/password-reset/request", method: "post", data })
}

/** Validate a password-reset token without consuming it */
export function fetchValidatePasswordReset(token: string) {
  return request<Api.Auth.PasswordResetValidate>({
    url: "/auth/password-reset/validate",
    method: "get",
    params: { token },
  })
}

/** Consume a password-reset token and replace the password */
export function fetchConfirmPasswordReset(data: Api.Auth.PasswordResetConfirmBody) {
  return request<boolean>({ url: "/auth/password-reset/confirm", method: "post", data })
}

/**
 * Refresh token
 *
 * @param refreshToken Refresh token
 */
export function fetchRefreshToken(refreshToken: string) {
  return request<Api.Auth.LoginToken>({
    url: "/auth/refreshToken",
    method: "post",
    data: {
      refreshToken,
    },
  })
}

/**
 * return custom backend error
 *
 * @param code error code
 * @param message error message
 */
export function fetchCustomBackendError(code: string, message: string) {
  return request({ url: "/auth/error", params: { code, message } })
}
