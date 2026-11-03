import { createFlatRequest } from "@rapidkit/axios"
import { localStg } from "@/utils/storage"
import { getServiceBaseURL } from "@/utils/service"
import type { Service } from "@/typings/service"
import { completeRequestDiagnostics, diagnosticRequest, startRequestDiagnostics } from "./diagnostics"
import { getAuthSession } from "./auth-session"

const isHttpProxy = import.meta.env.DEV && import.meta.env.VITE_HTTP_PROXY === "Y"
const { baseURL } = getServiceBaseURL(import.meta.env, isHttpProxy)

// Refresh failures must never enter the ordinary request's auth recovery interceptor.
export const refreshRequest = createFlatRequest<
  Service.Response<Api.Auth.LoginToken>,
  Api.Auth.LoginToken,
  Record<string, unknown>
>(
  { baseURL },
  {
    transform: (response) => response.data.data,
    isBackendSuccess: (response) => String(response.data.code) === import.meta.env.VITE_SERVICE_SUCCESS_CODE,
    onRequest(config) {
      getAuthSession()
      Object.assign(config, diagnosticRequest("auth.refresh"))
      startRequestDiagnostics(config)
      config.headers.set("Accept-Language", localStg.get("lang") || "zh-CN")
      return config
    },
    onResponse(response) {
      getAuthSession()
      completeRequestDiagnostics(response.config, response)
    },
    onError(error) {
      getAuthSession()
      if (error.config) completeRequestDiagnostics(error.config, error.response, error)
    },
  },
)
