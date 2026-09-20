export type RequestErrorKind = "business" | "network" | "server" | "unknown"

export interface NormalizedRequestError {
  kind: RequestErrorKind
  code: string
  message: string
}

interface RequestErrorMessages {
  network: string
  server: string
  unknown: string
}

interface ErrorLike {
  code?: string
  response?: {
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

  if (candidate?.code === "BACKEND_ERROR") {
    return {
      kind: "business",
      code: String(backendCode ?? "BACKEND_ERROR"),
      message: response?.data?.message || messages.unknown,
    }
  }

  if (candidate?.code === "ERR_NETWORK" || !response) {
    return {
      kind: candidate?.code === "ERR_NETWORK" ? "network" : "unknown",
      code: candidate?.code || "UNKNOWN",
      message: candidate?.code === "ERR_NETWORK" ? messages.network : messages.unknown,
    }
  }

  if ((response.status ?? 0) >= 500) {
    return { kind: "server", code: String(response.status), message: messages.server }
  }

  return { kind: "unknown", code: String(response.status ?? "UNKNOWN"), message: messages.unknown }
}
