import { createFlatRequest } from "@rapidkit/axios"
import { getRequestLocale, SERVICE_BASE_URL, SUCCESS_CODE } from "@/services/request-config"
import type { BackendResponse } from "@/services/request-config"

// Refresh errors are handled by the caller; this transport cannot refresh itself.
export const refreshRequest = createFlatRequest<BackendResponse, unknown, Record<string, unknown>>(
  { baseURL: SERVICE_BASE_URL },
  {
    transform: (response) => response.data.data,
    isBackendSuccess: (response) => String(response.data.code) === SUCCESS_CODE,
    onRequest(config) {
      config.headers.set("Accept-Language", getRequestLocale())
      return config
    },
  },
)
