// @vitest-environment jsdom
import { createSSRApp, h } from "vue"
import { renderToString } from "vue/server-renderer"
import { describe, expect, it, vi } from "vitest"
import LogViewer from "../../src/components/common/log-viewer/index.vue"
vi.mock("@/locales", () => ({
  $t: (key: string, params?: Record<string, unknown>) => `${key}${params ? JSON.stringify(params) : ""}`,
}))
function render(props: Record<string, unknown>, slots?: Record<string, () => unknown>) {
  return renderToString(createSSRApp({ render: () => h(LogViewer, props, slots) }))
}
describe("LogViewer rendering", () => {
  it("escapes markup and preserves a multiline stack as a single numbered record", async () => {
    const html = await render({
      records: [{ id: "err", level: "ERROR", timestamp: "12:30", message: "<script>alert(1)</script>\n  at run()" }],
    })
    expect(html).toContain("&lt;script&gt;")
    expect(html).not.toContain("<script>")
    expect(html).toContain("  at run()")
    expect(html).toContain("[ERROR]")
    expect(html.match(/class="log-line-number/g)).toHaveLength(1)
  })
  it("retains original numbering after truncation and can hide line numbers", async () => {
    const html = await render({ log: "old\nkept", maxEntries: 1 })
    expect(html).not.toContain(">old<")
    expect(html).toContain(">2</span>")
    expect(html).toContain("common.logViewer.truncated")
    const hidden = await render({ log: "kept", showLineNumbers: false })
    expect(hidden).not.toContain('class="log-line-number')
  })
  it("renders localized empty and initial-loading states", async () => {
    expect(await render({})).toContain("common.logViewer.empty")
    const loading = await render({ loading: true })
    expect(loading).toContain("common.logViewer.loading")
    expect(loading).not.toContain("common.logViewer.empty")
  })
  it("keeps existing content readable during loading or failure", async () => {
    const html = await render({ log: "previous output", error: "offline", loading: true })
    expect(html).toContain("previous output")
    expect(html).toContain("offline")
    expect(html).toContain('role="alert"')
    expect(html).toContain("common.logViewer.loading")
  })
  it("supports title and toolbar slots and reflects initial controlled settings", async () => {
    const html = await render(
      { log: "one", follow: false, wrap: false },
      { title: () => "Custom title", "toolbar-extra": () => h("button", "Retry") },
    )
    expect(html).toContain("Custom title")
    expect(html).toContain("Retry")
    expect(html).toContain("common.logViewer.bottom")
    expect(html).toContain("no-wrap")
  })
})
