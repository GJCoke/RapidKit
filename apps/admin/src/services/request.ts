import type { AxiosResponse } from "@rapidkit/axios"
import { BACKEND_ERROR_CODE, createFlatRequest } from "@rapidkit/axios"
import { getAuthSession, recordTokenRotation } from "@/services/auth-session"
import { resolveAuthErrorCodes } from "@/services/auth-error-codes"
import { notifyRequestError, notifySessionExpired } from "@/services/request-error-notifier"
import { createTokenRefreshCoordinator } from "@/services/token-refresh"
import { useAuthStore } from "@/stores/auth"
import { fetchRefreshToken } from "@/services/api/auth"
import { getRequestLocale, SERVICE_BASE_URL, SUCCESS_CODE } from "@/services/request-config"
import type { BackendResponse } from "@/services/request-config"

export { getRequestLocale } from "@/services/request-config"

interface RequestState extends Record<string, unknown> {
  refreshTokenPromise: null
}

let runRefreshRequest: () => Promise<boolean> = async () => false
const tokenRefreshCoordinator = createTokenRefreshCoordinator(() => runRefreshRequest())
const { expiredTokenCodes, logoutCodes } = resolveAuthErrorCodes(import.meta.env)

function getToken() {
  return localStorage.getItem("accessToken") || ""
}

function getRefreshToken() {
  return localStorage.getItem("refreshToken") || ""
}

export const request = createFlatRequest<BackendResponse, unknown, RequestState>(
  {
    baseURL: SERVICE_BASE_URL,
  },
  {
    defaultState: {
      refreshTokenPromise: null,
    },
    transform(response: AxiosResponse<BackendResponse>) {
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
      const token = getToken()
      if (token) {
        config.headers.set("Authorization", `Bearer ${token}`)
      }
      config.headers.set("Accept-Language", getRequestLocale())

      // Filter null/undefined params
      if (config.params) {
        config.params = Object.fromEntries(
          Object.entries(config.params as Record<string, unknown>).filter(([, v]) => v !== null && v !== undefined),
        )
      }

      return config
    },
    isBackendSuccess(response) {
      return String(response.data.code) === SUCCESS_CODE
    },
    async onBackendFail(response, instance) {
      const responseCode = String(response.data.code)
      const config = response.config as typeof response.config & { authRetried?: boolean; authSession?: number }
      const session = getAuthSession()
      if (config.authSession !== session) return null

      if (expiredTokenCodes.has(responseCode)) {
        if (config.authRetried) {
          notifySessionExpired()
          useAuthStore.getState().clearAuth("expired")
          return null
        }
        config.authRetried = true
        const currentToken = getToken()
        if (currentToken && config.headers.Authorization !== `Bearer ${currentToken}`) {
          config.headers.set("Authorization", `Bearer ${currentToken}`)
          return instance.request(config) as Promise<AxiosResponse>
        }
        runRefreshRequest = async () => {
          const refreshToken = getRefreshToken()
          if (!refreshToken) {
            if (getToken()) {
              notifySessionExpired()
              useAuthStore.getState().clearAuth("expired")
            }
            return false
          }

          try {
            const { data: tokens, error } = await fetchRefreshToken(refreshToken)
            if (getAuthSession() !== session) return false
            if (!error && tokens?.accessToken && tokens?.refreshToken) {
              recordTokenRotation(tokens.refreshToken)
              useAuthStore.getState().setToken(tokens.accessToken, tokens.refreshToken)
              return true
            }
          } catch {
            if (getAuthSession() !== session) return false
          }
          notifySessionExpired()
          useAuthStore.getState().clearAuth("expired")
          return false
        }

        try {
          const refreshed = await tokenRefreshCoordinator.refresh(session)
          if (refreshed && config.authSession === getAuthSession()) {
            const Authorization = `Bearer ${getToken()}`
            Object.assign(response.config.headers, { Authorization })
            return instance.request(response.config) as Promise<AxiosResponse>
          }
        } catch {
          // Refresh failures are handled inside the shared operation.
        }

        return null
      }

      if (logoutCodes.has(responseCode)) {
        notifySessionExpired()
        useAuthStore.getState().clearAuth("forced")
      }

      return null
    },
    onError(error) {
      if (error.code === BACKEND_ERROR_CODE) {
        const responseCode = String(error.response?.data?.code ?? "")
        if (expiredTokenCodes.has(responseCode) || logoutCodes.has(responseCode)) return
      }
      notifyRequestError(error)
    },
  },
)
