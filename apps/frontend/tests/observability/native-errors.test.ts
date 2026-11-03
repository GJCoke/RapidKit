// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest"
import { setupBrowserObservability, captureBrowserError } from "@/observability"
import { getDiagnosticPackage, resetDiagnostics } from "@/utils/diagnostics"

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

it("captures global errors without DSN, deduplicates manual capture, and detaches handlers", () => {
  vi.stubEnv("VITE_SENTRY_DSN", "")
  vi.spyOn(console, "error").mockImplementation(() => {})
  const dispose = setupBrowserObservability()
  const suppress = (event: Event) => {
    event.preventDefault()
    event.stopImmediatePropagation()
  }
  window.addEventListener("error", suppress, true)
  window.addEventListener("unhandledrejection", suppress, true)
  resetDiagnostics()
  const error = new TypeError("private-global-message")
  const id = captureBrowserError(error, "render")
  window.dispatchEvent(new ErrorEvent("error", { error, message: "private-event-message" }))
  expect(getDiagnosticPackage().incidents).toHaveLength(1)
  expect(getDiagnosticPackage().incidents[0].diagnostic_id).toBe(id)
  const event = new Event("unhandledrejection")
  Object.defineProperty(event, "reason", { value: new RangeError("private-promise") })
  window.dispatchEvent(event)
  expect(getDiagnosticPackage().incidents.some((incident) => incident.category === "promise")).toBe(true)
  expect(JSON.stringify(getDiagnosticPackage())).not.toContain("private-")
  dispose()
  window.dispatchEvent(new ErrorEvent("error", { error: new URIError("after-dispose") }))
  expect(getDiagnosticPackage().incidents).toHaveLength(2)
  window.removeEventListener("error", suppress, true)
  window.removeEventListener("unhandledrejection", suppress, true)
})

it("identifies application asset failures without exposing query parameters or foreign assets", () => {
  vi.stubEnv("VITE_SENTRY_DSN", "")
  vi.spyOn(console, "error").mockImplementation(() => {})
  const dispose = setupBrowserObservability()
  const suppress = (event: Event) => event.stopImmediatePropagation()
  window.addEventListener("error", suppress, true)
  resetDiagnostics()
  const script = document.createElement("script")
  script.src = `${window.location.origin}/assets/main-a1.js?token=private-token`
  const error = new Event("error")
  Object.defineProperty(error, "target", { value: script })
  window.dispatchEvent(error)
  expect(getDiagnosticPackage().incidents[0]).toMatchObject({
    category: "resource",
    context: { asset_file: "main-a1.js" },
  })
  script.src = "https://foreign.test/assets/private-script.js"
  const foreignError = new Event("error")
  Object.defineProperty(foreignError, "target", { value: script })
  window.dispatchEvent(foreignError)
  expect(getDiagnosticPackage().incidents).toHaveLength(1)
  expect(JSON.stringify(getDiagnosticPackage())).not.toContain("private-")
  dispose()
  window.removeEventListener("error", suppress, true)
})
