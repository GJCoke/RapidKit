import type { AxiosResponse } from "@rapidkit/axios"
import { BACKEND_ERROR_CODE, createFlatRequest } from "@rapidkit/axios"
import { resolveAuthErrorCodes } from "@/services/auth-error-codes"
import { notifyRequestError, notifySessionExpired } from "@/services/request-error-notifier"
import { createTokenRefreshCoordinator } from "@/services/token-refresh"
import { useAuthStore } from "@/stores/auth"
import { useLocaleStore } from "@/stores/locale"

const SUCCESS_CODE = import.meta.env.VITE_SERVICE_SUCCESS_CODE || "0"
const SERVICE_BASE_URL = import.meta.env.VITE_SERVICE_BASE_URL

interface BackendResponse<T = unknown> {
  code: number
  message: string
  data: T
}

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

export function getRequestLocale() {
  return useLocaleStore.getState().locale
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

      if (expiredTokenCodes.has(responseCode)) {
        runRefreshRequest = async () => {
          const refreshToken = getRefreshToken()
          if (!refreshToken) return false

          const refreshResponse = await fetch(`${SERVICE_BASE_URL}/auth/token/refresh`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept-Language": getRequestLocale() },
            body: JSON.stringify({ refreshToken }),
          })
          if (!refreshResponse.ok) return false

          const refreshPayload = (await refreshResponse.json()) as BackendResponse<{
            accessToken: string
            refreshToken: string
          }>
          if (String(refreshPayload.code) !== SUCCESS_CODE) return false
          const tokens = refreshPayload.data
          if (!tokens) return false

          useAuthStore.getState().setToken(tokens.accessToken, tokens.refreshToken)
          return true
        }

        try {
          const refreshed = await tokenRefreshCoordinator.refresh()
          if (refreshed) {
            const Authorization = `Bearer ${getToken()}`
            Object.assign(response.config.headers, { Authorization })
            return instance.request(response.config) as Promise<AxiosResponse>
          }
        } catch {
          // The shared cleanup below handles refresh failures for every waiter.
        }

        notifySessionExpired()
        useAuthStore.getState().clearAuth("expired")
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
