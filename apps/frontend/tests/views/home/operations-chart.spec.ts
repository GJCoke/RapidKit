import { createSSRApp, ref } from "vue"
import { renderToString } from "vue/server-renderer"
import * as echarts from "echarts"
import { expect, it, vi } from "vitest"
import OperationsOverview from "../../../src/views/home/modules/operations-overview.vue"

const captured = vi.hoisted(() => ({ options: null as any }))
vi.mock("@/hooks/common/echarts", () => ({
  useEcharts: (factory: () => unknown) => {
    captured.options = factory()
    return { domRef: ref(null), updateOptions: vi.fn() }
  },
}))
vi.mock("naive-ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("naive-ui")>()),
  NSelect: { setup: () => () => null },
}))
vi.mock("@/locales", () => ({ $t: (key: string) => key }))

async function chartFor(trend: { date: string; requestCount: number; avgResponseMs: number | null }[], width = 640) {
  await renderToString(
    createSSRApp(OperationsOverview, {
      data: { summary: {}, system: {}, trend } as Api.Dashboard.OperationsOverview,
      range: "7d",
      loading: false,
      error: false,
    }),
  )
  const chart = echarts.init(null, undefined, { renderer: "svg", ssr: true, width, height: 200 })
  chart.setOption({ ...captured.options, animation: false })
  return chart
}

it.each([
  [640, 20000, 800],
  [640, 120000, 3200],
  [320, 1000000, 12000],
])("keeps both peak markers below the plot ceiling at width %i", async (width, requests, latency) => {
  const chart = await chartFor(
    [
      { date: "2026-10-26", requestCount: 1, avgResponseMs: 1 },
      { date: "2026-10-27", requestCount: requests, avgResponseMs: latency },
    ],
    width,
  )
  try {
    for (const [seriesIndex, peak] of [
      [0, requests],
      [1, latency],
    ]) {
      const [, y] = chart.convertToPixel({ seriesIndex }, ["10/27", peak]) as number[]
      expect(y).toBeGreaterThan(47)
      expect(y).toBeLessThan(200)
    }
  } finally {
    chart.dispose()
  }
})

it.each(["2026-10-29T08:00:00", "2026-10-29T08:00:00Z"])("uses the instant for sync age: %s", async (value) => {
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-29T08:01:00Z"))
  try {
    const html = await renderToString(
      createSSRApp(OperationsOverview, {
        data: { timezone: "Asia/Shanghai", summary: {}, system: { lastSyncAt: value }, trend: [] } as any,
        range: "7d",
        loading: false,
        error: false,
      }),
    )
    expect(html).toContain("1 page.home.dashboard.minutes")
  } finally {
    vi.restoreAllMocks()
  }
})

it.each([[], [{ date: "2026-10-27", requestCount: 0, avgResponseMs: 0 }]])(
  "keeps empty and all-zero axes finite",
  async (...rows) => {
    const trend = rows.filter((row) => row && typeof row === "object" && "date" in row)
    const chart = await chartFor(trend as { date: string; requestCount: number; avgResponseMs: number | null }[])
    try {
      for (const yAxisIndex of [0, 1]) {
        expect(Number.isFinite(chart.convertToPixel({ yAxisIndex }, 0))).toBe(true)
      }
    } finally {
      chart.dispose()
    }
  },
)

it.each([
  {
    name: "an idle day between sampled days",
    trend: [
      { date: "2026-10-25", requestCount: 5, avgResponseMs: 12 },
      { date: "2026-10-26", requestCount: 0, avgResponseMs: null },
      { date: "2026-10-27", requestCount: 8, avgResponseMs: 18 },
    ],
    expected: [12, 0, 18],
  },
  {
    name: "a completely idle range",
    trend: [
      { date: "2026-10-26", requestCount: 0, avgResponseMs: null },
      { date: "2026-10-27", requestCount: 0, avgResponseMs: null },
    ],
    expected: [0, 0],
  },
  {
    name: "an unavailable measurement with requests",
    trend: [{ date: "2026-10-27", requestCount: 5, avgResponseMs: null }],
    expected: [null],
  },
])("renders latency values for $name", async ({ trend, expected }) => {
  const chart = await chartFor(trend)
  try {
    const series = chart.getOption().series as echarts.LineSeriesOption[]
    expect(series[1].data).toEqual(expected)
  } finally {
    chart.dispose()
  }
})
