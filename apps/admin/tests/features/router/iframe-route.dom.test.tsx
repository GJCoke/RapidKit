// @vitest-environment jsdom

import { fireEvent, screen } from "@testing-library/react"
import { expect, test } from "vitest"

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
