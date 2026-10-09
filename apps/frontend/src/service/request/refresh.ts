import { createFlatRequest } from "@rapidkit/axios"
import { localStg } from "@/utils/storage"
import { getServiceBaseURL } from "@/utils/service"
import type { Service } from "@/typings/service"

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
      config.headers.set("Accept-Language", localStg.get("lang") || "zh-CN")
      return config
    },
  },
)
