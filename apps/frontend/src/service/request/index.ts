/* oxlint-disable @typescript-eslint/no-explicit-any */
import type { AxiosResponse } from "@rapidkit/axios"
import { BACKEND_ERROR_CODE, CanceledError, createFlatRequest } from "@rapidkit/axios"
import { useAuthStore } from "@/store/modules/auth"
import { localStg } from "@/utils/storage"
import { getServiceBaseURL } from "@/utils/service"
import { $t } from "@/locales"
import { getAuthorization, handleExpiredRequest, showErrorMsg } from "./shared"
import { getAuthSession } from "./auth-session"
import type { RequestInstanceState } from "./type"
import { Service } from "@/typings/service"

const isHttpProxy = import.meta.env.DEV && import.meta.env.VITE_HTTP_PROXY === "Y"
const LOGIN_COOLDOWN_CODE = "14010"
/** Backend code for a route permission denial; triggers a permission refresh */
const PERMISSION_DENIED_CODE = "34001"
const IMPERSONATION_INVALID_CODES = new Set(["14017", "14002", "14003", "14008"])

function isImpersonationStop(config: { url?: string; method?: string } | undefined) {
  return config?.url === "/auth/impersonations/current" && config.method?.toLowerCase() === "delete"
}
const { baseURL } = getServiceBaseURL(import.meta.env, isHttpProxy)

export const request = createFlatRequest(
  {
    baseURL,
  },
  {
    defaultState: {
      errMsgStack: [],
      refreshTokenPromise: null,
    } as RequestInstanceState,
    transform(response: AxiosResponse<Service.Response<any>>) {
      return response.data.data
    },
    async onRequest(config) {
      const authConfig = config as typeof config & { authSession?: number }
      const session = getAuthSession()
      authConfig.authSession ??= session
      if (authConfig.authSession !== session) {
        config.signal = AbortSignal.abort()
        return config
      }
      const Authorization = getAuthorization()
      const language = localStg.get("lang") || "zh-CN"
      Object.assign(config.headers, { Authorization, "Accept-Language": language })

      // 过滤 params 中的 null/undefined 值，避免序列化为空字符串参数
      if (config.params) {
        config.params = Object.fromEntries(Object.entries(config.params).filter(([, v]) => v !== null))
      }

      return config
    },
    onResponse(response) {
      const config = response.config as typeof response.config & { authSession?: number }
      if (config.authSession !== getAuthSession()) throw new CanceledError("Identity changed")
    },
    isBackendSuccess(response) {
      // when the backend response code is "0000"(default), it means the request is success
      // to change this logic by yourself, you can modify the `VITE_SERVICE_SUCCESS_CODE` in `.env` file
      return String(response.data.code) === import.meta.env.VITE_SERVICE_SUCCESS_CODE
    },
    async onBackendFail(response, instance) {
      const authStore = useAuthStore()
      const responseCode = String(response.data.code)
      const config = response.config as typeof response.config & { authRetried?: boolean; authSession?: number }
      if (config.authSession !== getAuthSession()) return null
      if (localStg.get("impersonation") && IMPERSONATION_INVALID_CODES.has(responseCode)) {
        if (!isImpersonationStop(config)) await authStore.stopImpersonation()
        return null
      }

      if (responseCode === PERMISSION_DENIED_CODE) {
        authStore.syncPermissions()
      }

      function handleLogout() {
        authStore.resetStore()
      }

      function logoutAndCleanup() {
        handleLogout()
        window.removeEventListener("beforeunload", handleLogout)

        request.state.errMsgStack = request.state.errMsgStack.filter((msg) => msg !== response.data.message)
      }

      // when the backend response code is in `logoutCodes`, it means the user will be logged out and redirected to login page
      const logoutCodes = import.meta.env.VITE_SERVICE_LOGOUT_CODES?.split(",") || []
      if (logoutCodes.includes(responseCode)) {
        handleLogout()
        return null
      }

      // when the backend response code is in `modalLogoutCodes`, it means the user will be logged out by displaying a modal
      const modalLogoutCodes = import.meta.env.VITE_SERVICE_MODAL_LOGOUT_CODES?.split(",") || []
      if (modalLogoutCodes.includes(responseCode) && !request.state.errMsgStack?.includes(response.data.message)) {
        request.state.errMsgStack = [...(request.state.errMsgStack || []), response.data.message]

        // prevent the user from refreshing the page
        window.addEventListener("beforeunload", handleLogout)

        window.$dialog?.error({
          title: $t("common.error"),
          content: response.data.message,
          positiveText: $t("common.confirm"),
          maskClosable: false,
          closeOnEsc: false,
          onPositiveClick() {
            logoutAndCleanup()
          },
          onClose() {
            logoutAndCleanup()
          },
        })

        return null
      }

      // when the backend response code is in `expiredTokenCodes`, it means the token is expired, and refresh token
      const expiredTokenCodes = import.meta.env.VITE_SERVICE_EXPIRED_TOKEN_CODES?.split(",") || []
      if (expiredTokenCodes.includes(responseCode)) {
        if (config.authRetried) {
          await authStore.resetStore()
          return null
        }
        config.authRetried = true
        const currentAuthorization = getAuthorization()
        // Late responses sent with the old token can reuse a completed refresh.
        const alreadyRefreshed = currentAuthorization && config.headers.Authorization !== currentAuthorization
        const success = alreadyRefreshed || (await handleExpiredRequest(request.state, config.url === "/auth/logout"))
        if (success && config.authSession === getAuthSession()) {
          Object.assign(config.headers, { Authorization: getAuthorization() })
          return instance.request(config) as Promise<AxiosResponse>
        }
      }

      return null
    },
    async onError(error) {
      const config = error.config as (typeof error.config & { authSession?: number }) | undefined
      if (error.code === "ERR_CANCELED") return
      if (config?.authSession !== undefined && config.authSession !== getAuthSession()) return
      if (error.response?.status === 401 && localStg.get("impersonation")) {
        if (!isImpersonationStop(config)) await useAuthStore().stopImpersonation()
        return
      }
      // when the request is fail, you can show error message

      let message = error.message
      let backendErrorCode = ""

      // get backend error message and code
      if (error.code === BACKEND_ERROR_CODE) {
        message = error.response?.data?.message || message
        backendErrorCode = String(error.response?.data?.code || "")
      }

      // the error message is displayed in the modal
      const modalLogoutCodes = import.meta.env.VITE_SERVICE_MODAL_LOGOUT_CODES?.split(",") || []
      if (modalLogoutCodes.includes(backendErrorCode)) {
        return
      }

      if (backendErrorCode === LOGIN_COOLDOWN_CODE) {
        return
      }

      // when the token is expired, refresh token and retry request, so no need to show error message
      const expiredTokenCodes = import.meta.env.VITE_SERVICE_EXPIRED_TOKEN_CODES?.split(",") || []
      if (expiredTokenCodes.includes(backendErrorCode)) {
        return
      }

      showErrorMsg(request.state, message)
    },
  },
)

export function refreshAccessToken(): Promise<boolean> {
  return handleExpiredRequest(request.state)
}
