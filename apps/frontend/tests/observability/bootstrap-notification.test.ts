// @vitest-environment jsdom
import { expect, it, vi } from "vitest"
const state = vi.hoisted(() => ({
  app: { config: {} as { errorHandler?: (error: unknown) => void }, mount: vi.fn() },
  show: vi.fn(),
  capture: vi.fn(() => "a".repeat(21)),
}))
vi.mock("vue", async (original) => ({ ...(await original<typeof import("vue")>()), createApp: () => state.app }))
vi.mock("@/plugins/assets", () => ({}))
vi.mock("@/plugins", () => ({
  setupAppVersionNotification: vi.fn(),
  setupDayjs: vi.fn(),
  setupIconifyOffline: vi.fn(),
  setupLoading: vi.fn(),
  setupNProgress: vi.fn(),
}))
vi.mock("@/store", () => ({ setupStore: vi.fn() }))
vi.mock("@/router", () => ({ setupRouter: async () => {} }))
vi.mock("@/locales", () => ({ $t: (key: string) => key, setupI18n: vi.fn() }))
vi.mock("@/App.vue", () => ({ default: {} }))
vi.mock("@/observability", () => ({ captureBrowserError: state.capture }))
vi.mock("@/utils/diagnostic-message", () => ({ showDiagnosticNotification: state.show }))
it("routes application errors to the same safe diagnostic notification", async () => {
  await import("@/bootstrap")
  await vi.waitFor(() => expect(state.app.mount).toHaveBeenCalled())
  const error = new Error("private-render-error")
  state.app.config.errorHandler?.(error)
  expect(state.capture).toHaveBeenCalledWith(error, "render")
  expect(state.show).toHaveBeenCalledWith(
    "request.serverError",
    { diagnostic_id: "a".repeat(21) },
    { source: "bootstrap", group: "render" },
  )
  expect(JSON.stringify(state.show.mock.calls)).not.toContain("private-")
})
