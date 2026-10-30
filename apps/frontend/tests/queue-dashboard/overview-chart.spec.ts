// @vitest-environment jsdom
import { createApp, h, nextTick, reactive, ref } from "vue"
import { expect, it, vi } from "vitest"
import OverviewChart from "../../src/views/queue/dashboard/modules/overview-chart.vue"

const chart = vi.hoisted(() => ({ update: vi.fn(), render: null as any, options: null as any }))
const theme = ref({
  successColor: "green",
  errorColor: "red",
  primaryColor: "blue",
  textColor2: "black",
  borderColor: "gray",
})
vi.mock("@/locales", () => ({ $t: (key: string) => key }))
vi.mock("naive-ui", () => ({ useThemeVars: () => theme }))
vi.mock("@/hooks/common/echarts", () => ({
  useEcharts: (factory: any, hooks: any) => {
    chart.options = factory
    chart.render = hooks?.onRender
    return { domRef: ref(null), updateOptions: chart.update }
  },
}))

it("keeps daily buckets as platform calendar labels", () => {
  const host = document.createElement("div")
  const app = createApp({
    render: () =>
      h(OverviewChart, {
        kind: "completion",
        dashboard: {
          timezone: "Asia/Shanghai",
          timeline: [{ timeBucket: "2026-10-29", success: 2, failure: 0 }],
          depthTimeline: [],
        } as any,
      }),
  })
  app.mount(host)
  const options = chart.options()
  expect(options.xAxis.type).toBe("category")
  expect(options.xAxis.data).toEqual(["2026-10-29"])
  app.unmount()
})

it("ignores unrelated snapshot changes and merges only when displayed values change", async () => {
  const data = reactive({
    sampledAt: "2026-10-09T10:00:00Z",
    timeline: [{ timeBucket: "2026-10-09T10:00:00Z", success: 1, failure: 0 }],
    depthTimeline: [{ timeBucket: "2026-10-09T10:00:00Z", depth: 2 }],
  })
  const host = document.createElement("div")
  const app = createApp({ render: () => h(OverviewChart, { kind: "completion", dashboard: data as any }) })
  app.mount(host)
  await nextTick()
  chart.update.mockClear()
  const element = host.firstElementChild
  data.sampledAt = "2026-10-09T10:01:00Z"
  data.depthTimeline[0].depth = 3
  await nextTick()
  expect(chart.update).not.toHaveBeenCalled()
  data.timeline[0].success = 2
  await nextTick()
  expect(chart.update).toHaveBeenCalledTimes(1)
  expect(chart.update).toHaveBeenCalledWith(expect.any(Function), { clear: false })
  expect(host.firstElementChild).toBe(element)
  app.unmount()
})

for (const kind of ["tasks", "workers"] as const) {
  it(`opens ${kind} by full identity from either the bar or category label`, () => {
    const selected = vi.fn()
    const name = kind === "tasks" ? "plugin.tasks.exact.long_name" : "celery@worker.example"
    const host = document.createElement("div")
    const app = createApp({
      render: () =>
        h(OverviewChart, {
          kind,
          dashboard: null,
          tasks: [{ taskName: name, success: 2, failure: 1 }] as any,
          workers: [{ workerHostname: name, success: 2, failure: 1 }] as any,
          onSelect: selected,
        }),
    })
    app.mount(host)
    const on = vi.fn()
    chart.render({ on })
    const click = on.mock.calls.find(([event]) => event === "click")![1]
    click({ componentType: "series", name })
    click({ componentType: "yAxis", targetType: "axisLabel", value: name })
    click({ componentType: "legend", name: "success" })
    expect(selected.mock.calls).toEqual([[name], [name]])
    app.unmount()
  })
}
