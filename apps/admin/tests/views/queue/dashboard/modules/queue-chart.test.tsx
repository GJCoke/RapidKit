// @vitest-environment jsdom
import { cloneElement, type ReactElement } from "react"
import { fireEvent, screen } from "@testing-library/react"
import { expect, test, vi } from "vitest"
import { renderAdmin } from "@test/setup/render"
import { queueOverview } from "@test/setup/queue-fixtures"
vi.mock("recharts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("recharts")>()),
  ResponsiveContainer: ({ children }: { children: ReactElement<{ width: number; height: number }> }) =>
    cloneElement(children, { width: 600, height: 280 }),
}))
import { QueueChart } from "@/views/queue/dashboard/modules/queue-chart"
test("completion chart actually draws both outcome lines and exposes both legends", () => {
  const { container } = renderAdmin(
    <QueueChart
      kind="completion"
      dashboard={queueOverview({
        timeline: [
          { timeBucket: "2026-10-23T00:00:00Z", success: 4, failure: 1 },
          { timeBucket: "2026-10-24T00:00:00Z", success: 6, failure: 2 },
        ],
      })}
    />,
  )
  const paths = container.querySelectorAll("path.recharts-line-curve")
  expect(paths).toHaveLength(2)
  for (const path of paths) expect(path.getAttribute("d")).toMatch(/^M/)
  expect(screen.getByText("成功")).toBeInTheDocument()
  expect(screen.getByText("失败")).toBeInTheDocument()
})
test("ranking names support mouse and keyboard record navigation", () => {
  const select = vi.fn()
  renderAdmin(
    <QueueChart
      kind="workers"
      workers={[{ workerHostname: "worker@chart", total: 10, success: 8, failure: 2, avgRuntime: 0.2 }]}
      onSelect={select}
    />,
  )
  const name = screen.getByRole("button", { name: "worker@chart" })
  fireEvent.click(name)
  fireEvent.keyDown(name, { key: "Enter" })
  fireEvent.keyDown(name, { key: " " })
  expect(select.mock.calls).toEqual([["worker@chart"], ["worker@chart"], ["worker@chart"]])
})
