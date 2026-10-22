import { createSSRApp, h } from "vue"
import { renderToString } from "vue/server-renderer"
import { describe, expect, it, vi } from "vitest"
import PythonArgumentsViewer from "../../src/components/common/python-arguments-viewer/index.vue"

vi.mock("@/locales", () => ({
  $t: (key: string, params?: Record<string, unknown>) => `${key}${params ? JSON.stringify(params) : ""}`,
}))

function render(props: Record<string, unknown>) {
  return renderToString(createSSRApp({ render: () => h(PythonArgumentsViewer, props) }))
}

describe("grouped Python argument viewer", () => {
  it("keeps positional order and distinguishes strings, numbers, false and None", async () => {
    const args = ["False", false, null, 3, 3.5]
    const html = await render({ args, kwargs: { region: "Asia/Shanghai" } })
    expect(html.indexOf("[0]")).toBeLessThan(html.indexOf("[1]"))
    expect(html.indexOf("[1]")).toBeLessThan(html.indexOf("[4]"))
    expect(html).toContain("&quot;False&quot;")
    expect(html).toContain(">False</span>")
    expect(html).toContain(">None</span>")
    expect(html).toContain(">int</span>")
    expect(html).toContain(">float</span>")
    expect(html).toContain("region")
    expect(args).toEqual(["False", false, null, 3, 3.5])
  })

  it("summarizes nested collections without eagerly mounting their children", async () => {
    const html = await render({ args: [["hidden-child"]], kwargs: { options: { retry: 2, notify: true } } })
    expect(html).toContain(">list</span>")
    expect(html).toContain(">dict</span>")
    expect(html).toContain("common.pythonArgumentsViewer.items")
    expect(html).toContain("common.pythonArgumentsViewer.fields")
    expect(html).not.toContain("hidden-child")
    expect(html).not.toContain("notify")
    expect(html).not.toContain("code-line-content")
  })

  it("escapes parameter keys and text values instead of interpreting markup", async () => {
    const html = await render({
      args: ["<script>alert(1)</script>"],
      kwargs: { "<img onerror=alert(1)>": "<b>value</b>" },
    })
    expect(html).not.toContain("<script>")
    expect(html).not.toContain("<img")
    expect(html).toContain("&lt;script&gt;")
    expect(html).toContain("&lt;img onerror=alert(1)&gt;")
    expect(html).toContain("&lt;b&gt;value&lt;/b&gt;")
  })

  it("labels both empty groups and can omit the call preview", async () => {
    const html = await render({ args: null, kwargs: null, showPreview: false })
    expect(html).toContain("common.pythonArgumentsViewer.emptyArgs")
    expect(html).toContain("common.pythonArgumentsViewer.emptyKwargs")
    expect(html).not.toContain("common.pythonArguments.preview")
  })
})
