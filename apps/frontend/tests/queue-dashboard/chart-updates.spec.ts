// @vitest-environment jsdom
import { effectScope } from "vue"
import { afterEach, expect, it, vi } from "vitest"
import { useEcharts } from "../../src/hooks/common/echarts"

const mocks = vi.hoisted(() => ({ clear: vi.fn(), setOption: vi.fn(), dispose: vi.fn(), init: vi.fn() }))
vi.mock("echarts/core", () => ({ use: vi.fn(), init: mocks.init }))
vi.mock("@/store/modules/theme", () => ({ useThemeStore: () => ({ darkMode: false, themeColor: "blue" }) }))
const scope = effectScope()
afterEach(() => {
  scope.stop()
  vi.clearAllMocks()
})
it("merges chart data without clearing the existing instance", async () => {
  const hook = scope.run(() => useEcharts(() => ({ series: [{ id: "success", type: "line" as const, data: [1] }] })))!
  hook.domRef.value = document.createElement("div")
  hook.chart.value = {
    clear: mocks.clear,
    setOption: mocks.setOption,
    dispose: mocks.dispose,
    hideLoading: vi.fn(),
  } as any
  await hook.updateOptions(() => ({ series: [{ id: "success", type: "line", data: [2] }] }), { clear: false })
  expect(mocks.clear).not.toHaveBeenCalled()
  expect(mocks.setOption).toHaveBeenCalledWith(
    expect.objectContaining({ series: [{ id: "success", type: "line", data: [2] }] }),
  )
})
