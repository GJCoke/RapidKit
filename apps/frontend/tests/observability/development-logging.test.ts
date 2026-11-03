import { afterEach, expect, it, vi } from "vitest"

const sentry = vi.hoisted(() => ({ captureException: vi.fn(), init: vi.fn() }))
vi.mock("@sentry/browser", () => sentry)

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

it("prints explicitly captured render errors without a DSN", async () => {
  vi.resetModules()
  vi.stubEnv("VITE_SENTRY_DSN", "")
  vi.stubEnv("VITE_LOG_LEVEL", "warn")
  const output = vi.spyOn(console, "error").mockImplementation(() => {})
  const { captureBrowserError } = await import("@/observability")
  const error = new Error("Render failed")
  expect(captureBrowserError(error, "render")).toBeUndefined()
  expect(output).toHaveBeenCalledWith(
    expect.stringContaining("[ERROR] [observability]"),
    "Browser operation failed",
    "render",
    error,
  )
  expect(sentry.captureException).not.toHaveBeenCalled()
})

it("logger.error never initializes or sends Sentry events", async () => {
  const output = vi.spyOn(console, "error").mockImplementation(() => {})
  const { createLogger } = await import("@/utils/logger")
  sentry.init.mockClear()
  sentry.captureException.mockClear()
  createLogger("request").error("Failed")
  expect(output).toHaveBeenCalled()
  expect(sentry.init).not.toHaveBeenCalled()
  expect(sentry.captureException).not.toHaveBeenCalled()
})
