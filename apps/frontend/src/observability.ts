import * as Sentry from "@sentry/browser"
import { browserSentryOptions, safeRequestId } from "@rapidkit/utils"
import { createLogger } from "@/utils/logger"
import { captureDiagnosticError } from "@/utils/diagnostics"
import type { DiagnosticCategory } from "@/utils/diagnostics"
import { getAuthSession } from "@/service/request/auth-session"

const logger = createLogger("observability")

let enabled = false
let disposeLocal: (() => void) | undefined

export function setupBrowserObservability() {
  if (!disposeLocal) {
    getAuthSession()
    const onError = (event: Event) => {
      if ("error" in event) {
        captureBrowserError((event as ErrorEvent).error, "runtime")
        return
      }
      const target = event.target
      const source =
        target instanceof HTMLScriptElement
          ? target.src
          : target instanceof HTMLLinkElement && target.rel === "stylesheet"
            ? target.href
            : undefined
      if (!source) return
      const url = new URL(source, window.location.href)
      if (url.origin === window.location.origin && /^\/assets\/[A-Za-z0-9_.-]+\.(?:js|mjs|css)$/.test(url.pathname)) {
        captureBrowserError(new Error("Application asset failed"), "resource", undefined, {
          asset_file: url.pathname.split("/").at(-1),
        })
      }
    }
    const onPromise = (event: Event) => captureBrowserError((event as PromiseRejectionEvent).reason, "promise")
    const onPreload = (event: Event) => captureBrowserError((event as Event & { payload?: unknown }).payload, "route")
    window.addEventListener("error", onError, true)
    window.addEventListener("unhandledrejection", onPromise, true)
    window.addEventListener("vite:preloadError", onPreload)
    disposeLocal = () => {
      window.removeEventListener("error", onError, true)
      window.removeEventListener("unhandledrejection", onPromise, true)
      window.removeEventListener("vite:preloadError", onPreload)
      disposeLocal = undefined
    }
  }
  const options = browserSentryOptions(import.meta.env, "vue")
  if (!options || enabled) return disposeLocal
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
  } catch {
    // An unavailable diagnostic platform must not prevent the application from starting.
  }
  return disposeLocal
}

export function captureBrowserError(error: unknown, category: DiagnosticCategory, id?: string, fields?: unknown) {
  getAuthSession()
  const diagnosticId = captureDiagnosticError(error, category, fields || { request_id: id })
  logger.error("Browser operation failed", category, error, { diagnostic_id: diagnosticId })
  if (!enabled) return diagnosticId
  try {
    const requestId = safeRequestId(id)
    Sentry.captureException(error instanceof Error ? error : new Error("Browser operation failed"), {
      tags: { category, ...(requestId ? { request_id: requestId } : {}) },
    })
  } catch {
    // Local diagnostics remain available when the optional transport fails.
  }
  return diagnosticId
}
