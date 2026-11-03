import { isAxiosError } from "@rapidkit/axios"
import { requestIdsFromHeaders } from "@rapidkit/utils"

const levels = ["debug", "info", "warn", "error", "silent"] as const
type LogLevel = (typeof levels)[number]
type OutputLevel = Exclude<LogLevel, "silent">
type LogMethod = (...args: unknown[]) => void

function validLevel(value: unknown): value is LogLevel {
  return levels.includes(value as LogLevel)
}

let minimumLevel: LogLevel = import.meta.env.DEV ? "debug" : "warn"
if (validLevel(import.meta.env.VITE_LOG_LEVEL)) minimumLevel = import.meta.env.VITE_LOG_LEVEL
try {
  const override = localStorage.getItem(`${import.meta.env.VITE_STORAGE_PREFIX || ""}LOG_LEVEL`)
  if (validLevel(override)) minimumLevel = override
} catch {
  // Storage can be unavailable in private browsing or before a browser environment exists.
}

export function logPath(url?: string) {
  if (!url) return undefined
  try {
    const parsed = new URL(url, "https://logger.invalid")
    return /^https?:$/.test(parsed.protocol) ? parsed.pathname : "[invalid-url]"
  } catch {
    return "[invalid-url]"
  }
}

function summarizeAxiosError(value: unknown) {
  if (!isAxiosError<{ code?: unknown }>(value)) return value
  const businessCode = value.response?.data?.code
  const ids = requestIdsFromHeaders(value.response?.headers)
  const message =
    /^(?:Network Error|canceled|the backend request error|Request failed with status code \d{3}|timeout of \d+ms exceeded)$/.test(
      value.message,
    )
      ? value.message
      : "Request failed"
  return {
    method: value.config?.method?.toUpperCase(),
    path: logPath(value.config?.url),
    status: value.response?.status,
    business_code: typeof businessCode === "number" ? businessCode : undefined,
    code: typeof value.code === "string" && /^[A-Z_]{1,64}$/.test(value.code) ? value.code : undefined,
    client_request_id: requestIdsFromHeaders(value.config?.headers).requestId,
    request_id: ids.requestId,
    edge_request_id: ids.edgeRequestId,
    message,
  }
}

export function createLogger(scope: string): Record<OutputLevel, LogMethod> {
  return Object.fromEntries(
    levels
      .filter((level): level is OutputLevel => level !== "silent")
      .map((level) => [
        level,
        (...args: unknown[]) => {
          if (levels.indexOf(level) < levels.indexOf(minimumLevel)) return
          const now = new Date()
          const time = `${now.toTimeString().slice(0, 8)}.${String(now.getMilliseconds()).padStart(3, "0")}`
          console[level].bind(
            console,
            `[${time}] [${level.toUpperCase()}] [${scope}]`,
          )(...args.map(summarizeAxiosError))
        },
      ]),
  ) as Record<OutputLevel, LogMethod>
}
