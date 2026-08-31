import type { Service } from "@/typings/service"

declare global {
  namespace Api {
    /**
     * namespace Auth
     *
     * backend api module: "auth"
     */
    namespace Auth {
      type LoginBody = Service.ApiRequest<"/api/v1/auth/login", "post", "body">

      type LoginToken = Service.ApiResponse<"/api/v1/auth/login", "post">

      type UserInfo = Service.ApiResponse<"/api/v1/auth/user/info">

      type PublicKey = Service.ApiResponse<"/api/v1/auth/keys/public">

      type SetPasswordBody = Service.ApiRequest<"/api/v1/auth/invite/set-password", "post", "body">

      type InviteValidate = Service.ApiResponse<"/api/v1/auth/invite/validate", "get">

      type PasswordResetRequestBody = Service.ApiRequest<"/api/v1/auth/password-reset/request", "post", "body">

      type PasswordResetValidate = Service.ApiResponse<"/api/v1/auth/password-reset/validate", "get">

      type PasswordResetConfirmBody = Service.ApiRequest<"/api/v1/auth/password-reset/confirm", "post", "body">
    }

    namespace Role {
      type GetRoleQuery = Service.ApiRequest<"/api/v1/roles", "get", "query">

      type PutRolePath = Service.ApiRequest<"/api/v1/roles/{role_id}", "put", "path">
    }
  }
}
