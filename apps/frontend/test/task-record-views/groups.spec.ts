// @vitest-environment jsdom
import { createApp, h, nextTick, reactive } from "vue"
import { describe, expect, it, vi } from "vitest"
import TaskGroups from "../../src/views/queue/task/modules/task-groups.vue"
const api = vi.hoisted(() => ({ fetch: vi.fn(), table: null as any }))
vi.mock("@/service/api", () => ({ fetchTaskStatsByName: api.fetch }))
vi.mock("@/locales", () => ({ $t: (key: string) => key }))
vi.mock("naive-ui", () => ({
  NCard: {
    setup:
      (_: any, { slots }: any) =>
      () =>
        slots.default?.(),
  },
  NDataTable: {
    props: ["columns", "data", "pagination"],
    setup: (p: any) => {
      api.table = p
      return () =>
        h(
          "div",
          p.data.flatMap((row: any) =>
            p.columns.map((c: any) => h("span", c.render ? c.render(row) : String(row[c.key] ?? ""))),
          ),
        )
    },
  },

  NButton: {
    props: ["onClick"],
    setup:
      (props: any, { slots }: any) =>
      () =>
        h("button", { onClick: props.onClick }, slots.default?.()),
  },
}))
const flush = async () => {
  await nextTick()
  await nextTick()
  await nextTick()
}
describe("task summary table", () => {
  it("uses backend percent, drills failure and total, paginates, and ignores stale filter responses", async () => {
    let resolveOld: (value: any) => void = () => {}
    api.fetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve
        }),
    )
    api.fetch.mockResolvedValue({
      data: {
        records: [
          {
            taskName: "jobs.new",
            total: 5,
            success: 4,
            failure: 1,
            inProgress: 0,
            successRate: 80,
            lastExecutedAt: null,
          },
        ],
        total: 1,
      },
      error: null,
    })
    const props = reactive({ query: { page: 3, pageSize: 10, taskName: "old" } })
    const drills: unknown[] = [],
      pages: unknown[] = []
    const app = createApp({
      render: () =>
        h(TaskGroups, {
          ...props,
          onDrill: (name: string, failure: boolean) => drills.push([name, failure]),
          onPage: (page: number) => pages.push(page),
        }),
    })
    const host = document.createElement("div")
    app.mount(host)
    props.query.taskName = "new"
    await flush()
    expect(api.fetch).toHaveBeenLastCalledWith(expect.objectContaining({ taskName: "new", page: 3 }))
    expect(host.textContent).toContain("80.0%")
    const buttons = host.querySelectorAll("button")
    buttons[0].click()
    buttons[1].click()
    expect(drills).toEqual([
      ["jobs.new", false],
      ["jobs.new", true],
    ])
    api.table.pagination.onUpdatePage(4)
    expect(pages).toEqual([4])
    resolveOld({ data: { records: [{ taskName: "stale" }], total: 99 }, error: null })
    await flush()
    expect(host.textContent).not.toContain("stale")
    expect(api.table.pagination.itemCount).toBe(1)
    app.unmount()
  })
})
