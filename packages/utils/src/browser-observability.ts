/** Strict outbound diagnostic schema shared by both browser applications. */
function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {}
}

export function safeRequestId(value: unknown): string | undefined {
  return typeof value === "string" && (/^[A-Za-z0-9_-]{21}$/.test(value) || /^[a-f0-9]{32}$/i.test(value))
    ? value
    : undefined
}

export async function copyRequestId(value: unknown): Promise<boolean> {
  const id = safeRequestId(value)
  if (!id || !globalThis.navigator?.clipboard) return false
  try {
    await navigator.clipboard.writeText(id)
    return true
  } catch {
    return false
  }
}

export function requestIdFromHeaders(headers: unknown): string | undefined {
  const ids = requestIdsFromHeaders(headers)
  return ids.requestId || ids.edgeRequestId
}

export function requestIdsFromHeaders(headers: unknown): { requestId?: string; edgeRequestId?: string } {
  try {
    const values = object(headers)
    const read = (name: string) =>
      typeof values.get === "function"
        ? values.get(name)
        : values[Object.keys(values).find((key) => key.toLowerCase() === name) || ""]
    const requestId = read("x-request-id")
    const edgeRequestId = read("x-edge-request-id")
    return {
      ...(typeof requestId === "string" && /^[A-Za-z0-9_-]{21}$/.test(requestId) ? { requestId } : {}),
      ...(typeof edgeRequestId === "string" && /^[a-f0-9]{32}$/i.test(edgeRequestId) ? { edgeRequestId } : {}),
    }
  } catch {
    return {}
  }
}

export function shouldReportRequestFailure(error: unknown): boolean {
  const value = object(error)
  if (value.code === "ERR_CANCELED") return false
  const response = object(value.response)
  if (!value.response) return true
  return (typeof response.status === "number" && response.status >= 500) || Number(object(response.data).code) === 7001
}

function assetUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  try {
    const url = new URL(value)
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) return undefined
    const match = url.pathname.match(/\/assets\/([A-Za-z0-9_.-]+\.(?:js|mjs))$/)
    return match ? `${url.origin}/assets/${match[1]}` : undefined
  } catch {
    return undefined
  }
}

const ERROR_TYPES = new Set([
  "Error",
  "TypeError",
  "ReferenceError",
  "SyntaxError",
  "RangeError",
  "URIError",
  "AggregateError",
])
const CATEGORIES = new Set(["runtime", "promise", "bootstrap", "render", "route", "request", "socket"])

export function browserSentryOptions(
  env: { PROD?: boolean; MODE?: string; VITE_SENTRY_DSN?: string; VITE_SENTRY_RELEASE?: string },
  application: "vue" | "react",
) {
  if (!env.PROD || !env.VITE_SENTRY_DSN || !env.VITE_SENTRY_RELEASE) return undefined
  return {
    dsn: env.VITE_SENTRY_DSN,
    release: env.VITE_SENTRY_RELEASE,
    environment:
      (
        { prod: "PRODUCTION", production: "PRODUCTION", test: "TESTING", development: "DEVELOPMENT" } as Record<
          string,
          string
        >
      )[env.MODE || "prod"] || env.MODE,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      stackFrameVariables: false,
      frameContextLines: 0,
    },
    transportOptions: { fetchOptions: { credentials: "omit" as const, referrerPolicy: "no-referrer" as const } },
    enableLogs: false,
    defaultIntegrations: false as const,
    maxBreadcrumbs: 0,
    tracesSampleRate: 0,
    beforeBreadcrumb: () => null,
    beforeSend: sanitizeBrowserEvent,
    beforeSendTransaction: () => null,
    initialScope: { tags: { application } },
  }
}

export function sanitizeBrowserEvent(input: unknown) {
  try {
    const event = object(input)
    const tags = object(event.tags)
    const requestId = safeRequestId(tags.request_id)
    const exceptions = object(event.exception).values
    const values = (Array.isArray(exceptions) ? exceptions : []).slice(0, 5).map((value) => {
      const exception = object(value)
      const mechanism = object(exception.mechanism)
      const rawFrames = object(exception.stacktrace).frames
      const frames = (Array.isArray(rawFrames) ? rawFrames : []).slice(-50).flatMap((raw) => {
        const frame = object(raw)
        const filename = assetUrl(frame.filename)
        if (!filename) return []
        const lineno =
          typeof frame.lineno === "number" && Number.isInteger(frame.lineno) && frame.lineno > 0
            ? frame.lineno
            : undefined
        const colno =
          typeof frame.colno === "number" && Number.isInteger(frame.colno) && frame.colno >= 0 ? frame.colno : undefined
        return [{ filename, lineno, colno }]
      })
      return {
        type: typeof exception.type === "string" && ERROR_TYPES.has(exception.type) ? exception.type : "Error",
        value: "Browser operation failed",
        mechanism: { type: "generic", handled: typeof mechanism.handled === "boolean" ? mechanism.handled : true },
        stacktrace: { frames },
      }
    })
    const rawImages = object(event.debug_meta).images
    const images = (Array.isArray(rawImages) ? rawImages : []).flatMap((raw) => {
      const image = object(raw)
      const codeFile = assetUrl(image.code_file)
      return codeFile &&
        typeof image.debug_id === "string" &&
        /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(image.debug_id)
        ? [{ type: "sourcemap" as const, code_file: codeFile, debug_id: image.debug_id }]
        : []
    })
    return {
      type: undefined,
      event_id:
        typeof event.event_id === "string" && /^[a-f\d]{32}$/i.test(event.event_id) ? event.event_id : undefined,
      timestamp: typeof event.timestamp === "number" && Number.isFinite(event.timestamp) ? event.timestamp : undefined,
      platform: "javascript",
      level: "error" as const,
      release: typeof event.release === "string" ? event.release.slice(0, 200) : undefined,
      environment: typeof event.environment === "string" ? event.environment.slice(0, 64) : undefined,
      exception: {
        values: values.length
          ? values
          : [{ type: "Error", value: "Browser operation failed", stacktrace: { frames: [] } }],
      },
      tags: {
        ...(requestId ? { request_id: requestId } : {}),
        category:
          typeof tags.category === "string" && CATEGORIES.has(tags.category)
            ? tags.category
            : Array.isArray(exceptions) &&
                exceptions.some((value) =>
                  String(object(object(value).mechanism).type || "").endsWith("onunhandledrejection"),
                )
              ? "promise"
              : "runtime",
        application: tags.application === "react" ? "react" : "vue",
      },
      ...(images.length ? { debug_meta: { images } } : {}),
    }
  } catch {
    return null
  }
}
