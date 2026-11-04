// @vitest-environment jsdom
import { createApp, h, nextTick, shallowReactive } from "vue"
import { beforeEach, afterEach, expect, it, vi, type Mock } from "vitest"
import type { NotificationOptions } from "naive-ui"
const mocked = vi.hoisted(() => ({ copy: vi.fn(), download: vi.fn() }))
vi.mock("@rapidkit/utils", async (original) => ({
  ...(await original<typeof import("@rapidkit/utils")>()),
  copyRequestId: mocked.copy,
}))
vi.mock("@/utils/download-diagnostics", () => ({ downloadDiagnosticPackage: mocked.download }))
vi.mock("@/locales", () => ({
  $t: (key: string, params?: Record<string, unknown>) =>
    key === "request.copyReference"
      ? `Copy ${params?.label}`
      : key === "request.repeatedError"
        ? `Repeated ${params?.count}`
        : key,
}))
import { showDiagnosticNotification, clearDiagnosticNotifications } from "@/utils/diagnostic-message"
import { diagnosticGeneration, resetDiagnostics } from "@/utils/diagnostics"
import { getAuthSession } from "@/service/request/auth-session"
const refs = {
  request_id: "a".repeat(21),
  edge_request_id: "b".repeat(32),
  client_request_id: "c".repeat(21),
  diagnostic_id: "d".repeat(21),
}
let rows: (NotificationOptions & { destroy: Mock<() => void>; key: number })[]
let root: HTMLElement,
  app: ReturnType<typeof createApp>,
  error: ReturnType<typeof vi.fn>,
  message: ReturnType<typeof vi.fn>
let key = 0
beforeEach(() => {
  getAuthSession()
  resetDiagnostics()
  clearDiagnosticNotifications()
  mocked.copy.mockReset().mockResolvedValue(true)
  mocked.download.mockReset().mockReturnValue(true)
  rows = shallowReactive([])
  message = vi.fn()
  error = vi.fn((options: NotificationOptions) => {
    const row = {
      ...options,
      key: ++key,
      destroy: vi.fn(() => {
        const i = rows.indexOf(row)
        if (i >= 0) rows.splice(i, 1)
        options.onAfterLeave?.()
      }),
    }
    rows.push(row)
    return row
  })
  window.$notification = { error } as any
  window.$message = { error: message } as any
  root = document.createElement("div")
  document.body.append(root)
  app = createApp({
    render: () =>
      h(
        "div",
        rows.map((row) =>
          h("section", { key: row.key }, [
            typeof row.title === "function" ? row.title() : row.title,
            typeof row.content === "function" ? row.content() : row.content,
          ]),
        ),
      ),
  })
  app.mount(root)
})
afterEach(() => {
  clearDiagnosticNotifications()
  app.unmount()
  root.remove()
  vi.restoreAllMocks()
  vi.useRealTimers()
  delete window.$notification
  delete window.$message
})
const button = (text: string) => [...root.querySelectorAll("button")].find((b) => b.textContent?.trim() === text)!

it("keeps only the primary reference visible until details expand, then copies each correctly", async () => {
  showDiagnosticNotification("request.serverError", refs, { source: "request", group: "PUT:/users/one" })
  await nextTick()
  expect(error.mock.calls[0][0]).toMatchObject({ duration: 0, closable: true })
  expect(root.querySelectorAll("code")).toHaveLength(1)
  expect(root.textContent).toContain(refs.request_id)
  expect(root.textContent).not.toContain(refs.edge_request_id)
  button("request.showDetails").click()
  await nextTick()
  expect(root.querySelectorAll("code")).toHaveLength(4)
  const copy = root.querySelector<HTMLButtonElement>('[aria-label="Copy request.edgeRequestId"]')!
  copy.click()
  await Promise.resolve()
  await nextTick()
  expect(mocked.copy).toHaveBeenCalledWith(refs.edge_request_id)
  expect(root.textContent).toContain("request.copySucceeded")
  button("request.hideDetails").click()
  await nextTick()
  expect(root.querySelectorAll("code")).toHaveLength(1)
})

it.each([
  [{ edge_request_id: refs.edge_request_id, client_request_id: refs.client_request_id }, refs.edge_request_id],
  [{ client_request_id: refs.client_request_id, diagnostic_id: refs.diagnostic_id }, refs.client_request_id],
  [{ diagnostic_id: refs.diagnostic_id }, refs.diagnostic_id],
])("selects the highest available valid reference", async (reference, primary) => {
  showDiagnosticNotification("Unavailable", reference, { source: "request" })
  await nextTick()
  expect(root.querySelector("code")?.textContent).toBe(primary)
})

it("validates and freezes the copied reference values without retaining arbitrary properties", async () => {
  const values = { ...refs, body: "private-body" } as any
  showDiagnosticNotification("Unavailable", values, { source: "request" })
  values.request_id = "private-changed"
  await nextTick()
  expect(root.textContent).toContain(refs.request_id)
  expect(root.textContent).not.toContain("private-")
  clearDiagnosticNotifications()
  showDiagnosticNotification(
    "Unavailable",
    { request_id: "x".repeat(32), edge_request_id: "private-id", client_request_id: "x" },
    { source: "request" },
  )
  await nextTick()
  expect(root.querySelector("code")).toBeNull()
  expect(root.textContent).toContain("Unavailable")
})

it("reports copy and export failures inside the card without creating another error", async () => {
  mocked.copy.mockResolvedValue(false)
  mocked.download.mockReturnValue(false)
  showDiagnosticNotification("Unavailable", refs, { source: "request" })
  await nextTick()
  root.querySelector<HTMLButtonElement>('[aria-label="Copy request.requestId"]')!.click()
  await Promise.resolve()
  await nextTick()
  expect(root.textContent).toContain("request.copyFailed")
  button("request.exportDiagnostics").click()
  await nextTick()
  expect(root.textContent).toContain("request.exportFailed")
  expect(error).toHaveBeenCalledOnce()
  expect(message).not.toHaveBeenCalled()
})

it("merges within five seconds without changing the first snapshot or mixing different operations", async () => {
  vi.useFakeTimers({ toFake: ["performance"] })
  showDiagnosticNotification("Unavailable", refs, { source: "request", group: "PUT:/users/one" })
  showDiagnosticNotification(
    "Unavailable",
    { request_id: "z".repeat(21) },
    { source: "request", group: "PUT:/users/one" },
  )
  await nextTick()
  expect(error).toHaveBeenCalledOnce()
  expect(root.textContent).toContain("Repeated 2")
  expect(root.textContent).toContain(refs.request_id)
  expect(root.textContent).not.toContain("z".repeat(21))
  showDiagnosticNotification("Unavailable", refs, { source: "request", group: "PUT:/roles/one" })
  showDiagnosticNotification("Unavailable", refs, { source: "socket", group: "PUT:/users/one" })
  expect(error).toHaveBeenCalledTimes(3)
  vi.advanceTimersByTime(5001)
  const oldest = rows[0]
  showDiagnosticNotification("Unavailable", refs, { source: "request", group: "PUT:/users/one" })
  expect(oldest.destroy).toHaveBeenCalledOnce()
  expect(rows).toHaveLength(3)
})

it("does not suppress feedback after provider startup and allows a closed group to reappear", async () => {
  delete window.$notification
  delete window.$message
  showDiagnosticNotification("Unavailable", refs, { source: "bootstrap" })
  expect(error).not.toHaveBeenCalled()
  window.$notification = { error } as any
  showDiagnosticNotification("Unavailable", refs, { source: "bootstrap" })
  await nextTick()
  expect(error).toHaveBeenCalledOnce()
  rows[0].onClose?.()
  rows[0]?.destroy()
  showDiagnosticNotification("Unavailable", refs, { source: "bootstrap" })
  expect(error).toHaveBeenCalledTimes(2)
})

it("clears persistent cards on diagnostic identity reset and ignores stale asynchronous copy completion", async () => {
  let finish!: (value: boolean) => void
  mocked.copy.mockImplementation(
    () =>
      new Promise<boolean>((resolve) => {
        finish = resolve
      }),
  )
  const owner = diagnosticGeneration()
  showDiagnosticNotification("Unavailable", refs, { source: "request" })
  await nextTick()
  root.querySelector<HTMLButtonElement>('[aria-label="Copy request.requestId"]')!.click()
  const old = rows[0]
  resetDiagnostics()
  expect(diagnosticGeneration()).toBe(owner + 1)
  expect(old.destroy).toHaveBeenCalledOnce()
  finish(true)
  await Promise.resolve()
  await nextTick()
  expect(root.textContent).toBe("")
})
