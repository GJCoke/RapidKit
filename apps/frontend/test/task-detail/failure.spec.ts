// @vitest-environment jsdom
import { createApp, createSSRApp, h, nextTick, reactive } from "vue"
import type { App } from "vue"
import { renderToString } from "vue/server-renderer"
import { afterEach, describe, expect, it, vi } from "vitest"
import TaskFailure from "../../src/views/queue/task/modules/task-failure.vue"
vi.mock("@/locales", () => ({ $t: (key: string) => key }))
let app: App | undefined, host: HTMLDivElement | undefined
function render(props: Record<string, unknown>) {
  return renderToString(createSSRApp({ render: () => h(TaskFailure, { taskId: "t1", status: "4", ...props }) }))
}
afterEach(() => {
  app?.unmount()
  host?.remove()
  app = undefined
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
describe("task failure presentation", () => {
  it("preserves complete multiline messages and safely escapes markup", async () => {
    const html = await render({ exception: "ValueError: <invalid>\n  detail" })
    expect(html).toContain("ValueError: &lt;invalid&gt;\n  detail")
    expect(html).toContain("page.manage.worker.copyException")
  })
  it("shows missing failure details rather than an empty error area", async () => {
    expect(await render({})).toContain("page.manage.worker.noExceptionDetails")
    expect(await render({ exception: "  ", traceback: "\n" })).toContain("page.manage.worker.noExceptionDetails")
  })
  it("keeps traceback collapsed and lazily renders it", async () => {
    const html = await render({ traceback: "Traceback private-body" })
    expect(html).toContain("page.manage.worker.noExceptionMessage")
    expect(html).toContain("<details")
    expect(html).not.toContain("Traceback private-body")
    expect(html).not.toContain('role="log"')
  })
  it("does not invent an error for successful tasks without evidence", async () => {
    const html = await render({ status: "3" })
    expect(html).not.toContain("noExceptionDetails")
    expect(html).not.toContain('role="alert"')
  })
  it("copies exact messages, reports rejection, and closes stacks on task change", async () => {
    Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value() {} })
    let copied = ""
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: async (text: string) => {
          copied = text
        },
      },
    })
    const props = reactive({ taskId: "t1", status: "4", exception: "Error\n  detail", traceback: "private-stack" })
    host = document.createElement("div")
    document.body.append(host)
    app = createApp({ render: () => h(TaskFailure, props) })
    app.mount(host)
    await nextTick()
    const copy = host.querySelector('button[aria-label="page.manage.worker.copyException"]') as HTMLButtonElement
    copy.click()
    await nextTick()
    await nextTick()
    expect(copied).toBe("Error\n  detail")
    expect(host.textContent).toContain("page.manage.worker.exceptionCopied")
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
    expect(host.textContent).toContain("page.manage.worker.exceptionCopyFailed")
    const details = host.querySelector("details")!
    details.open = true
    details.dispatchEvent(new Event("toggle"))
    await nextTick()
    expect(host.querySelector('[role="log"]')!.textContent).toContain("private-stack")
    props.taskId = "t2"
    props.traceback = "second-stack"
    await nextTick()
    await nextTick()
    expect(details.open).toBe(false)
    expect(host.querySelector('[role="log"]')).toBeNull()
    expect(host.textContent).not.toContain("exceptionCopyFailed")
  })
})
