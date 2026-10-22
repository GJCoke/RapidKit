// @vitest-environment jsdom
import { createSSRApp, h } from "vue"
import { renderToString } from "vue/server-renderer"
import { describe, expect, it, vi } from "vitest"
import TaskOutput from "../../src/views/queue/task/modules/task-output.vue"
vi.mock("@/locales", () => ({ $t: (key: string) => key }))
function render(result: unknown, status: Api.Worker.TaskInfo["status"] = "4") {
  return renderToString(
    createSSRApp({
      render: () =>
        h(TaskOutput, {
          task: {
            taskId: "t1",
            status,
            result,
            exception: "problem",
            traceback: "hidden-stack",
            logs: "execution-text",
          },
        }),
    }),
  )
}
describe("task output composition", () => {
  it("places return values before consolidated failure and execution logs", async () => {
    const html = await render({ ok: false })
    expect(html.indexOf("page.manage.worker.result")).toBeLessThan(html.indexOf("page.manage.worker.exception"))
    expect(html.indexOf("page.manage.worker.exception")).toBeLessThan(html.indexOf("page.manage.worker.logs"))
    expect(html).toContain("problem")
    expect(html).toContain("execution-text")
    expect(html).not.toContain("hidden-stack")
  })
  it.each([0, false, ""])("keeps falsy return values: %s", async (value) => {
    expect(await render(value, "3")).toContain("page.manage.worker.result")
  })
  it("omits absent task return values", async () => {
    expect(await render(null)).not.toContain("page.manage.worker.result")
  })
})
