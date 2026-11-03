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
import { diagnosticMessage } from "@/utils/diagnostic-message"

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

it("shows separately named IDs and an export button in error feedback", async () => {
  const root = document.createElement("div")
  const render = diagnosticMessage("Unavailable", {
    request_id: "abcdefghijklmnopqrstu",
    edge_request_id: "a".repeat(32),
    diagnostic_id: "ABCDEFGHIJKLMNOPQRSTU",
  })
  const app = createApp({ render: typeof render === "function" ? render : () => h("div", render) })
  app.mount(root)
  try {
    expect(root.textContent).toContain("request.requestId")
    expect(root.textContent).toContain("request.edgeRequestId")
    expect(root.textContent).toContain("request.diagnosticId")
    const button = [...root.querySelectorAll("button")].find(
      (item) => item.textContent === "request.exportDiagnostics",
    )!
    expect(button).toBeDefined()
    button.click()
    await nextTick()
    expect(saved).toHaveLength(1)
  } finally {
    app.unmount()
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
