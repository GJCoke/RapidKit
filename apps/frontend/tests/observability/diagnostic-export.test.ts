// @vitest-environment jsdom
import { Blob as NodeBlob } from "node:buffer"
import { createApp, h, nextTick } from "vue"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { getAuthSession } from "@/service/request/auth-session"
import {
  captureDiagnosticError,
  getDiagnosticPackage,
  recordDiagnosticEvent,
  resetDiagnostics,
} from "@/utils/diagnostics"
import { downloadDiagnosticPackage } from "@/utils/download-diagnostics"
import { showDiagnosticNotification, clearDiagnosticNotifications } from "@/utils/diagnostic-message"

vi.mock("@/locales", () => ({ $t: (key: string) => key }))
let saved: NodeBlob[]
beforeEach(() => {
  getAuthSession()
  resetDiagnostics()
  saved = []
  vi.stubGlobal("Blob", NodeBlob)
  vi.stubGlobal(
    "URL",
    class {
      static createObjectURL(blob: NodeBlob) {
        saved.push(blob)
        return "blob:diagnostics"
      }
      static revokeObjectURL = vi.fn()
    },
  )
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})
})
afterEach(() => {
  clearDiagnosticNotifications()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it("downloads a sanitized JSON file without a network request", async () => {
  const fetch = vi.spyOn(window, "fetch").mockImplementation(() => {
    throw new Error("must not upload")
  })
  recordDiagnosticEvent({
    category: "request",
    phase: "failure",
    request_id: "abcdefghijklmnopqrstu",
    message: "private-message",
    body: "private-body",
  } as any)
  captureDiagnosticError(new Error("private-error"), "request")
  expect(downloadDiagnosticPackage()).toBe(true)
  const content = await saved[0].text()
  expect(JSON.parse(content)).toMatchObject({
    schema_version: 1,
    application: "vue",
    lookup: { request_ids: ["abcdefghijklmnopqrstu"] },
  })
  expect(content).not.toContain("private-")
  expect(fetch).not.toHaveBeenCalled()
  expect(document.querySelector("a[download]")).toBeNull()
})

it("exports the real sanitized package from the diagnostic notification", async () => {
  const error = vi.fn((_options: unknown) => ({ destroy: vi.fn() }))
  window.$notification = { error } as any
  showDiagnosticNotification("Unavailable", {
    request_id: "abcdefghijklmnopqrstu",
    edge_request_id: "a".repeat(32),
    diagnostic_id: "ABCDEFGHIJKLMNOPQRSTU",
  })
  const options = error.mock.calls[0][0] as any
  const root = document.createElement("div")
  const app = createApp({ render: options.content })
  app.mount(root)
  try {
    const details = [...root.querySelectorAll("button")].find((b) => b.textContent === "request.showDetails")!
    details.click()
    await nextTick()
    expect(root.textContent).toContain("request.edgeRequestId")
    const button = [...root.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === "request.exportDiagnostics",
    )!
    button.click()
    await nextTick()
    expect(saved).toHaveLength(1)
    expect(JSON.parse(await saved[0].text()).application).toBe("vue")
  } finally {
    app.unmount()
    delete window.$notification
  }
})

it("clears diagnostics before exporting after a credential change", async () => {
  recordDiagnosticEvent({ category: "navigation", phase: "success", route: "home" })
  expect(getDiagnosticPackage().events).toHaveLength(1)
  const { localStg } = await import("@/utils/storage")
  localStg.set("token", "changed-identity")
  try {
    expect(downloadDiagnosticPackage()).toBe(true)
    expect(JSON.parse(await saved[0].text()).events).toEqual([])
  } finally {
    localStg.remove("token")
    getAuthSession()
  }
})
