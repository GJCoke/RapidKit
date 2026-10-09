// @vitest-environment jsdom
import { Blob as NodeBlob } from "node:buffer"
import { createApp, createSSRApp, h, nextTick } from "vue"
import type { App } from "vue"
import { renderToString } from "vue/server-renderer"
import { afterEach, describe, expect, it, vi } from "vitest"
import JsonViewer from "../../src/components/common/json-viewer/index.vue"
vi.mock("@/locales", () => ({ $t: (key: string) => key }))
let app: App | undefined, host: HTMLDivElement | undefined
async function mount(value: unknown) {
  host = document.createElement("div")
  document.body.append(host)
  app = createApp({ render: () => h(JsonViewer, { value, filename: "task-result.json" }) })
  app.mount(host)
  await nextTick()
  return host
}
function render(props: Record<string, unknown>) {
  return renderToString(createSSRApp({ render: () => h(JsonViewer, { value: undefined, ...props }) }))
}
afterEach(() => {
  app?.unmount()
  host?.remove()
  app = undefined
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
describe("public JsonViewer", () => {
  it("escapes markup inside highlighted keys and values", async () => {
    const html = await render({ value: { "<img>": "<script>danger()</script>" } })
    expect(html).toContain("&lt;img&gt;")
    expect(html).toContain("&lt;script&gt;")
    expect(html).not.toContain("<script>")
    expect(html).not.toContain("<img>")
    expect(html).toContain("token-property")
    expect(html).toContain("token-string")
  })
  it("shows null as JSON and undefined as unavailable", async () => {
    expect(await render({ value: null })).toContain(">null</span>")
    expect(await render({ value: undefined })).toContain("common.jsonViewer.empty")
  })
  it("reports invalid serialization and disables copy/download", async () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    const element = await mount(circular)
    expect(element.textContent).toContain("common.jsonViewer.invalid")
    const buttons = [...element.querySelectorAll("button")]
    expect(buttons.filter((b) => b.disabled)).toHaveLength(2)
    expect(element.querySelector("code")).toBeNull()
  })
  it("copies formatted source and reports clipboard failures", async () => {
    let copied = ""
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: async (text: string) => {
          copied = text
        },
      },
    })
    const element = await mount({ ok: false, count: 0 })
    const button = element.querySelector('button[aria-label="common.jsonViewer.copy"]') as HTMLButtonElement
    button.click()
    await nextTick()
    await nextTick()
    expect(copied).toBe('{\n  "ok": false,\n  "count": 0\n}')
    expect(element.querySelector('[role="status"]')!.textContent).toBe("common.jsonViewer.copied")
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: async () => {
          throw new Error("denied")
        },
      },
    })
    button.click()
    await nextTick()
    await nextTick()
    expect(element.querySelector('[role="alert"]')!.textContent).toBe("common.jsonViewer.copyFailed")
    expect(element.textContent).not.toContain("common.jsonViewer.copied")
  })
  it("downloads identical JSON with application/json MIME and releases its URL", async () => {
    vi.useFakeTimers()
    vi.stubGlobal("Blob", NodeBlob)
    let blob: Blob | undefined,
      filename = ""
    const revoked: string[] = []
    vi.stubGlobal("URL", {
      createObjectURL: (value: Blob) => {
        blob = value
        return "blob:result"
      },
      revokeObjectURL: (url: string) => revoked.push(url),
    })
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      filename = this.download
    })
    const element = await mount([0, false, ""])
    ;(element.querySelector('button[aria-label="common.jsonViewer.download"]') as HTMLButtonElement).click()
    expect(await blob!.text()).toBe('[\n  0,\n  false,\n  ""\n]')
    expect(blob!.type).toBe("application/json;charset=utf-8")
    expect(filename).toBe("task-result.json")
    expect(document.querySelector("a")).toBeNull()
    await vi.runAllTimersAsync()
    expect(revoked).toEqual(["blob:result"])
  })
  it("toggles actual line-number visibility and wrapping", async () => {
    const element = await mount({ key: "value" })
    const checkboxes = [...element.querySelectorAll('[role="checkbox"]')]
    expect(element.querySelectorAll(".json-line-number")).toHaveLength(3)
    ;(checkboxes.find((e) => e.textContent?.includes("common.jsonViewer.lineNumbers")) as HTMLElement).click()
    await nextTick()
    expect(element.querySelector(".json-line-number")).toBeNull()
    ;(checkboxes.find((e) => e.textContent?.includes("common.jsonViewer.wrap")) as HTMLElement).click()
    await nextTick()
    expect(element.querySelector(".json-content")!.classList.contains("no-wrap")).toBe(true)
  })
})
