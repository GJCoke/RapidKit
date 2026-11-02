import * as Sentry from "@sentry/browser"
import { browserSentryOptions, safeRequestId } from "@rapidkit/utils"

let enabled = false

export function setupBrowserObservability() {
  const options = browserSentryOptions(import.meta.env, "vue")
  if (!options) return
  try {
    Sentry.init({
      ...options,
      integrations: [
        Sentry.globalHandlersIntegration(),
        Sentry.browserApiErrorsIntegration(),
        Sentry.dedupeIntegration(),
      ],
    })
    enabled = true
    window.addEventListener("vite:preloadError", (event) => {
      captureBrowserError((event as Event & { payload?: unknown }).payload, "route")
    })
  } catch {
    // An unavailable diagnostic platform must not prevent the application from starting.
  }
}

export function captureBrowserError(
  error: unknown,
  category: "runtime" | "bootstrap" | "render" | "route" | "request" | "socket",
  id?: string,
) {
  if (!enabled) return undefined
  try {
    const requestId = safeRequestId(id)
    return Sentry.captureException(error instanceof Error ? error : new Error("Browser operation failed"), {
      tags: { category, ...(requestId ? { request_id: requestId } : {}) },
    })
  } catch {
    return undefined
  }
}
