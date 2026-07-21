import type { AxiosResponse } from "@rapidkit/axios"
import { BACKEND_ERROR_CODE, createFlatRequest } from "@rapidkit/axios"
import i18n from "@/locales"

const SUCCESS_CODE = import.meta.env.VITE_SERVICE_SUCCESS_CODE || "0"

interface BackendResponse<T = unknown> {
  code: number
  message: string
  data: T
}

interface RequestState extends Record<string, unknown> {
  refreshTokenPromise: Promise<boolean> | null
}

function getToken() {
  return localStorage.getItem("accessToken") || ""
}

function getRefreshToken() {
  return localStorage.getItem("refreshToken") || ""
}

export const request = createFlatRequest<BackendResponse, unknown, RequestState>(
  {
    baseURL: import.meta.env.VITE_SERVICE_BASE_URL,
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
      config.headers.set("Accept-Language", i18n.language)

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

      // Token expired — attempt refresh
      const expiredTokenCodes = ["4001"]
      if (expiredTokenCodes.includes(responseCode)) {
        const refreshToken = getRefreshToken()
        if (refreshToken) {
          try {
            const res = await instance.post("/auth/refreshToken", { refreshToken })
            if (res.data?.data) {
              localStorage.setItem("accessToken", res.data.data.accessToken)
              localStorage.setItem("refreshToken", res.data.data.refreshToken)
              const Authorization = `Bearer ${res.data.data.accessToken}`
              Object.assign(response.config.headers, { Authorization })
              return instance.request(response.config) as Promise<AxiosResponse>
            }
          } catch {
            localStorage.removeItem("accessToken")
            localStorage.removeItem("refreshToken")
            window.location.href = "/login"
          }
        }
      }

      // Force logout codes
      const logoutCodes = ["4002", "4003"]
      if (logoutCodes.includes(responseCode)) {
        localStorage.removeItem("accessToken")
        localStorage.removeItem("refreshToken")
        window.location.href = "/login"
      }

      return null
    },
    onError(error) {
      let message = error.message
      if (error.code === BACKEND_ERROR_CODE) {
        message = error.response?.data?.message || message
      }
      console.error("[Request Error]", message)
    },
  },
)
