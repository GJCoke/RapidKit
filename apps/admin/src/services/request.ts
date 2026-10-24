import type { AxiosResponse, CustomAxiosRequestConfig, ResponseType } from "@rapidkit/axios"
import { BACKEND_ERROR_CODE, CanceledError, createFlatRequest } from "@rapidkit/axios"
import { getAuthSession, recordTokenRotation } from "@/services/auth-session"
import { resolveAuthErrorCodes } from "@/services/auth-error-codes"
import { notifyRequestError, notifySessionExpired } from "@/services/request-error-notifier"
import { createTokenRefreshCoordinator } from "@/services/token-refresh"
import { useAuthStore } from "@/stores/auth"
import { fetchRefreshToken } from "@/services/api/auth"
import { getRequestLocale, SERVICE_BASE_URL, SUCCESS_CODE } from "@/services/request-config"
import type { BackendResponse } from "@/services/request-config"
import { getCredentials, hasImpersonationStorage } from "@/features/auth/impersonation-storage"
import { recoverImpersonation } from "@/services/impersonation-recovery"

export { getRequestLocale } from "@/services/request-config"

interface RequestState extends Record<string, unknown> {
  refreshTokenPromise: null
}

let runRefreshRequest: () => Promise<boolean> = async () => false
const tokenRefreshCoordinator = createTokenRefreshCoordinator(() => runRefreshRequest())
const { expiredTokenCodes, logoutCodes } = resolveAuthErrorCodes(import.meta.env)

function getToken() {
  return getCredentials().accessToken
}

function getRefreshToken() {
  return getCredentials().refreshToken
}

const impersonationFailureCodes = new Set(["14002", "14003", "14008", "14017"])
function isStopRequest(config: { url?: string; method?: string } | undefined) {
  return config?.method?.toLowerCase() === "delete" && config.url?.split("?")[0] === "/auth/impersonations/current"
}

const transport = createFlatRequest<BackendResponse, unknown, RequestState>(
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
    onResponse(response) {
      const config = response.config as typeof response.config & { authSession?: number }
      if (config.authSession !== getAuthSession())
        throw new CanceledError("Identity changed", "ERR_CANCELED", response.config)
    },
    async onBackendFail(response, instance) {
      const responseCode = String(response.data.code)
      const config = response.config as typeof response.config & { authRetried?: boolean; authSession?: number }
      const session = getAuthSession()
      if (config.authSession !== session) return null

      if (hasImpersonationStorage() && impersonationFailureCodes.has(responseCode)) {
        // Stop is already restoring this identity; never recursively recover or refresh it.
        if (!isStopRequest(config)) await recoverImpersonation()
        return null
      }

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
    async onError(error) {
      const config = error.config as (typeof error.config & { authSession?: number }) | undefined
      if (
        error.code === "ERR_CANCELED" ||
        (config?.authSession !== undefined && config.authSession !== getAuthSession())
      )
        return
      const responseCode = String(error.response?.data?.code ?? "")
      if (
        hasImpersonationStorage() &&
        (error.response?.status === 401 || impersonationFailureCodes.has(responseCode))
      ) {
        if (!isStopRequest(config)) await recoverImpersonation()
        return
      }
      if (error.code === BACKEND_ERROR_CODE) {
        if (expiredTokenCodes.has(responseCode) || logoutCodes.has(responseCode)) return
      }
      notifyRequestError(error)
    },
  },
)

function scopedRequest<T = unknown, R extends ResponseType = "json">(config: CustomAxiosRequestConfig<R>) {
  // Axios request interceptors run asynchronously; capture the calling identity before that queue can yield.
  const scopedConfig = { ...config, authSession: getAuthSession() }
  return transport<T, R>(scopedConfig)
}
export const request = Object.assign(scopedRequest, {
  state: transport.state,
  cancelAllRequest: transport.cancelAllRequest,
})
