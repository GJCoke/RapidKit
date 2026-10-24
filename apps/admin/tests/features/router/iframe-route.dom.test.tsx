// @vitest-environment jsdom

import { act, fireEvent, screen } from "@testing-library/react"
import { afterEach, expect, test, vi } from "vitest"

import { renderAdmin } from "@test/setup/render"
import { IframeRoute } from "@/features/router/iframe-route"

test("moves a safe iframe from loading to ready", () => {
  renderAdmin(<IframeRoute src="https://example.com/embed" title="Example" />)
  const frame = screen.getByTitle("Example")
  expect(screen.getByText("加载中...")).toBeInTheDocument()
  fireEvent.load(frame)
  expect(screen.queryByText("加载中...")).toBeNull()
  expect(frame).toHaveClass("w-full")
  expect(frame).toHaveAttribute("sandbox", "allow-forms allow-modals allow-popups allow-same-origin allow-scripts")
})

test("rejects unsafe iframe urls without rendering an iframe", () => {
  renderAdmin(<IframeRoute src="javascript:alert(1)" title="Unsafe" />)
  expect(screen.queryByTitle("Unsafe")).toBeNull()
  expect(screen.getByText("嵌入页面加载失败")).toBeInTheDocument()
})

afterEach(() => vi.useRealTimers())

test("a different iframe URL starts a fresh load after failure and ignores the old frame", () => {
  vi.useFakeTimers()
  const view = renderAdmin(<IframeRoute src="https://example.com/old" title="Old" timeoutMs={20} />)
  const old = screen.getByTitle("Old")
  act(() => vi.advanceTimersByTime(21))
  expect(screen.getByText("嵌入页面加载失败")).toBeInTheDocument()
  view.rerender(<IframeRoute src="https://example.com/new?path=%2Fkeep" title="New" />)
  const next = screen.getByTitle("New")
  expect(next).toHaveAttribute("src", "https://example.com/new?path=%2Fkeep")
  expect(screen.getByText("加载中...")).toBeInTheDocument()
  fireEvent.load(old)
  expect(screen.getByText("加载中...")).toBeInTheDocument()
  fireEvent.load(next)
  expect(screen.queryByText("加载中...")).not.toBeInTheDocument()
})

test("timeout exposes retry and a detached frame cannot complete the new attempt", () => {
  vi.useFakeTimers()
  renderAdmin(<IframeRoute src="https://example.com/slow" title="Slow" timeoutMs={20} />)
  const old = screen.getByTitle("Slow")
  act(() => vi.advanceTimersByTime(21))
  expect(screen.getByText("嵌入页面加载失败")).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "重试" }))
  const next = screen.getByTitle("Slow")
  expect(next).not.toBe(old)
  fireEvent.load(old)
  expect(screen.getByText("加载中...")).toBeInTheDocument()
  fireEvent.load(next)
  expect(screen.queryByText("加载中...")).not.toBeInTheDocument()
})

test("changing a ready source or recovering from an unsafe source starts a real loading state", () => {
  const view = renderAdmin(<IframeRoute src="https://example.com/ready" title="Ready" />)
  fireEvent.load(screen.getByTitle("Ready"))
  view.rerender(<IframeRoute src="https://example.com/next" title="Next" />)
  expect(screen.getByText("加载中...")).toBeInTheDocument()
  view.rerender(<IframeRoute src="javascript:alert(1)" title="Unsafe" />)
  expect(screen.queryByTitle("Unsafe")).not.toBeInTheDocument()
  view.rerender(<IframeRoute src="https://example.com/recovered" title="Recovered" />)
  expect(screen.getByText("加载中...")).toBeInTheDocument()
  fireEvent.load(screen.getByTitle("Recovered"))
  expect(screen.queryByText("嵌入页面加载失败")).not.toBeInTheDocument()
})
