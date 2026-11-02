// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, expect, test, vi } from "vitest"
import { AppErrorBoundary } from "@/app/app-error-boundary"

const reporter = vi.hoisted(() => ({ captureBrowserError: vi.fn(() => "a".repeat(32)) }))
vi.mock("@/observability", () => reporter)

afterEach(() => vi.restoreAllMocks())

test("root rendering failure shows safe feedback and a copyable diagnostic ID", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {})
  const writeText = vi.fn(async () => {})
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
  function Broken(): never {
    throw new Error("private-render-password")
  }
  render(
    <AppErrorBoundary>
      <Broken />
    </AppErrorBoundary>,
  )
  expect(await screen.findByRole("alert")).toBeInTheDocument()
  expect(screen.queryByText("private-render-password")).not.toBeInTheDocument()
  expect(screen.getByText("a".repeat(32))).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "复制请求编号" }))
  expect(writeText).toHaveBeenCalledWith("a".repeat(32))
  expect(reporter.captureBrowserError).toHaveBeenCalledWith(expect.any(Error), "render")
})
