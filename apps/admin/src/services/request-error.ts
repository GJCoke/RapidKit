import { requestIdFromHeaders } from "@rapidkit/utils"

export type RequestErrorKind = "business" | "network" | "server" | "unknown"

export interface NormalizedRequestError {
  kind: RequestErrorKind
  code: string
  message: string
  requestId?: string
}

interface RequestErrorMessages {
  network: string
  server: string
  unknown: string
}

interface ErrorLike {
  code?: string
  response?: {
    headers?: unknown
    status?: number
    data?: {
      code?: string | number
      message?: string
    }
  }
}

export function normalizeRequestError(error: unknown, messages: RequestErrorMessages): NormalizedRequestError {
  const candidate = error as ErrorLike
  const response = candidate?.response
  const backendCode = response?.data?.code
  const requestId = requestIdFromHeaders(response?.headers)
  const diagnostic = requestId ? { requestId } : {}

  if ((response?.status ?? 0) >= 500 || Number(backendCode) === 7001) {
    return { kind: "server", code: String(backendCode ?? response?.status), message: messages.server, ...diagnostic }
  }

  if (candidate?.code === "BACKEND_ERROR") {
    return {
      kind: "business",
      code: String(backendCode ?? "BACKEND_ERROR"),
      message: response?.data?.message || messages.unknown,
      ...diagnostic,
    }
  }

  if (candidate?.code === "ERR_NETWORK" || !response) {
    return {
      kind: candidate?.code === "ERR_NETWORK" ? "network" : "unknown",
      code: candidate?.code || "UNKNOWN",
      message: candidate?.code === "ERR_NETWORK" ? messages.network : messages.unknown,
      ...diagnostic,
    }
  }

  return { kind: "unknown", code: String(response.status ?? "UNKNOWN"), message: messages.unknown, ...diagnostic }
}
