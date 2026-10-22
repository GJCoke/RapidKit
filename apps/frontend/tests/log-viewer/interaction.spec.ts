// @vitest-environment jsdom
import { createApp, h, nextTick, reactive } from "vue"
import type { App } from "vue"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import LogViewer from "../../src/components/common/log-viewer/index.vue"
import type { LogRecord } from "../../src/components/common/log-viewer/types"
vi.mock("@/locales", () => ({
  $t: (key: string, params?: Record<string, unknown>) => `${key}${params ? JSON.stringify(params) : ""}`,
}))
beforeEach(() => {
  // jsdom lacks native element scrolling. Preserve its observable scroll position/events.
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value(this: HTMLElement, options: ScrollToOptions) {
      this.scrollTop = Math.max(0, Math.min(options.top ?? 0, this.scrollHeight - this.clientHeight))
      this.dispatchEvent(new Event("scroll"))
    },
  })
})
let app: App | undefined
let host: HTMLDivElement
async function mount(records: LogRecord[]) {
  host = document.createElement("div")
  document.body.append(host)
  const state = reactive({ records })
  app = createApp({ render: () => h(LogViewer, { records: state.records }) })
  app.mount(host)
  await nextTick()
  return state
}
afterEach(() => {
  app?.unmount()
  host?.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
describe("LogViewer interactions", () => {
  it("keeps follow paused when filtering automatically clamps the native scroll position", async () => {
    vi.useFakeTimers()
    await mount([
      { id: 1, message: "first" },
      { id: 2, message: "match" },
    ])
    await vi.advanceTimersByTimeAsync(110)
    const container = host.querySelector(".n-scrollbar-container") as HTMLElement
    Object.defineProperties(container, {
      scrollHeight: { configurable: true, value: 1000 },
      clientHeight: { configurable: true, value: 200 },
    })
    container.scrollTop = 0
    container.dispatchEvent(new Event("scroll"))
    await nextTick()
    const input = host.querySelector("input")!
    input.value = "match"
    input.dispatchEvent(new Event("input", { bubbles: true }))
    await nextTick()
    Object.defineProperty(container, "scrollHeight", { configurable: true, value: 200 })
    container.dispatchEvent(new Event("scroll"))
    await nextTick()
    expect(host.textContent).toContain("common.logViewer.bottom")
    expect(host.textContent).not.toContain("common.logViewer.following")
  })

  it("allows keyboard focus on the log viewport", async () => {
    await mount([{ id: 1, message: "first" }])
    expect(host.querySelector('[role="log"]')!.getAttribute("tabindex")).toBe("0")
  })

  it("pauses scrollbar dragging even while programmatic follow is guarded", async () => {
    vi.useFakeTimers()
    await mount([{ id: 1, message: "first" }])
    const container = host.querySelector(".n-scrollbar-container") as HTMLElement
    Object.defineProperties(container, {
      scrollHeight: { configurable: true, value: 1000 },
      clientHeight: { configurable: true, value: 200 },
    })
    host.querySelector(".n-scrollbar")!.dispatchEvent(new Event("pointerdown", { bubbles: true }))
    container.scrollTop = 100
    container.dispatchEvent(new Event("scroll"))
    await nextTick()
    expect(host.textContent).toContain("common.logViewer.bottom")
    expect(host.textContent).not.toContain("common.logViewer.following")
  })

  it("notifies when the parent rolling buffer evicts the reading anchor", async () => {
    vi.useFakeTimers()
    const state = await mount([
      { id: 1, message: "first" },
      { id: 2, message: "second" },
    ])
    await vi.advanceTimersByTimeAsync(110)
    const container = host.querySelector(".n-scrollbar-container") as HTMLElement
    Object.defineProperties(container, {
      scrollHeight: { configurable: true, value: 1000 },
      clientHeight: { configurable: true, value: 200 },
    })
    for (const [index, row] of [...host.querySelectorAll<HTMLElement>("[data-log-key]")].entries()) {
      row.getBoundingClientRect = () => ({ top: index * 21, bottom: (index + 1) * 21 }) as DOMRect
    }
    container.scrollTop = 0
    container.dispatchEvent(new Event("scroll"))
    await nextTick()
    state.records = [
      { id: 2, message: "second" },
      { id: 3, message: "third" },
    ]
    await nextTick()
    await nextTick()
    expect(host.textContent).toContain("common.logViewer.anchorLost")
  })

  it("filters visible logs and copies just that result, reporting clipboard rejection", async () => {
    let copied = ""
    vi.stubGlobal("navigator", {
      ...navigator,
      clipboard: {
        writeText: async (text: string) => {
          copied = text
        },
      },
    })
    await mount([
      { id: 1, message: "hidden" },
      { id: 2, message: "Failure\n  stack", level: "ERROR" },
    ])
    const input = host.querySelector("input")!
    input.value = "FAIL"
    input.dispatchEvent(new Event("input", { bubbles: true }))
    await nextTick()
    expect(host.querySelector('[role="log"]')!.textContent).not.toContain("hidden")
    const copy = [...host.querySelectorAll("button")].find((b) => b.textContent?.includes("common.logViewer.copy"))!
    copy.click()
    await nextTick()
    await nextTick()
    expect(copied).toBe("[ERROR] Failure\n  stack")
    expect(host.querySelector('[role="status"]')?.textContent).toContain("common.logViewer.copied")
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: async () => {
          throw new Error("denied")
        },
      },
    })
    copy.click()
    await nextTick()
    await nextTick()
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("common.logViewer.copyFailed")
    expect(host.textContent).not.toContain("common.logViewer.copied")
  })
  it("pauses on user scrolling, reports additions and resumes with the bottom button", async () => {
    vi.useFakeTimers()
    const state = await mount([{ id: 1, message: "first" }])
    await vi.advanceTimersByTimeAsync(110)
    const container = host.querySelector(".n-scrollbar-container") as HTMLElement
    Object.defineProperties(container, {
      scrollHeight: { configurable: true, value: 1000 },
      clientHeight: { configurable: true, value: 200 },
    })
    container.scrollTop = 100
    container.dispatchEvent(new Event("scroll"))
    await nextTick()
    expect(host.textContent).toContain("common.logViewer.bottom")
    state.records.push({ id: 2, message: "second" })
    await nextTick()
    await nextTick()
    expect(host.textContent).toContain('common.logViewer.newEntries{"count":1}')
    const bottom = [...host.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("common.logViewer.newEntries"),
    )!
    bottom.click()
    await nextTick()
    expect(host.textContent).toContain("common.logViewer.following")
    expect(host.textContent).not.toContain("common.logViewer.newEntries")
    // Verify our bottom action reaches the native scroll boundary, not just its label.
    expect(container.scrollTop).toBeGreaterThan(100)
  })
})
