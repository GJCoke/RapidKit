// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import { expect, test } from "vitest"
import { LayoutShell } from "@/features/layout/components/layout-shell"

function renderShell({
  fixedHeaderTabs,
  fullContent = false,
  orientation = "vertical",
  scrollMode = "content",
}: {
  fixedHeaderTabs: boolean
  fullContent?: boolean
  orientation?: "vertical" | "horizontal"
  scrollMode?: "content" | "body"
}) {
  const shellProps = {
    fixedHeaderTabs,
    orientation,
    sidebar: (
      <aside>
        sidebar <button type="button">hidden sidebar control</button>
      </aside>
    ),
    sidebarWidth: 220,
    header: (
      <header>
        header <button type="button">hidden header control</button>
      </header>
    ),
    tabs: <button type="button">exit content fullscreen</button>,
    scrollMode,
    fullContent,
  }

  return (
    <LayoutShell {...shellProps}>
      <div>content</div>
    </LayoutShell>
  )
}

test.each([
  ["vertical", "content"],
  ["vertical", "body"],
  ["horizontal", "content"],
  ["horizontal", "body"],
] as const)("fixed chrome keeps only content in the %s %s scroll owner", (orientation, scrollMode) => {
  render(renderShell({ fixedHeaderTabs: true, orientation, scrollMode }))

  const scrollOwner = screen.getByTestId("layout-scroll-owner")
  expect(scrollOwner).toHaveAttribute("data-layout-scroll-owner", "content")
  expect(scrollOwner).toContainElement(screen.getByText("content"))
  expect(scrollOwner).not.toContainElement(screen.getByTestId("layout-header-region"))
  expect(scrollOwner).not.toContainElement(screen.getByTestId("layout-tabs-region"))
  expect(screen.getByTestId("layout-fixed-chrome")).toContainElement(screen.getByTestId("layout-header-region"))
  expect(screen.getByTestId("layout-fixed-chrome")).toContainElement(screen.getByTestId("layout-tabs-region"))
})

test.each([
  ["vertical", "content"],
  ["vertical", "body"],
  ["horizontal", "content"],
  ["horizontal", "body"],
] as const)("flowing chrome shares the %s %s scroll owner with content", (orientation, scrollMode) => {
  render(renderShell({ fixedHeaderTabs: false, orientation, scrollMode }))

  const scrollOwner = screen.getByTestId("layout-scroll-owner")
  expect(scrollOwner).toHaveAttribute("data-layout-scroll-owner", "page")
  expect(scrollOwner).toContainElement(screen.getByText("content"))
  expect(scrollOwner).toContainElement(screen.getByTestId("layout-header-region"))
  expect(scrollOwner).toContainElement(screen.getByTestId("layout-tabs-region"))
  expect(screen.queryByTestId("layout-fixed-chrome")).not.toBeInTheDocument()
})

test.each([
  [true, "vertical"],
  [false, "vertical"],
  [true, "horizontal"],
  [false, "horizontal"],
] as const)(
  "content fullscreen only hides chrome and keeps tabs actionable (%s, %s)",
  (fixedHeaderTabs, orientation) => {
    const { rerender } = render(renderShell({ fixedHeaderTabs, fullContent: true, orientation }))

    expect(screen.getByText("header")).toBeInTheDocument()
    expect(screen.getByText("sidebar")).toBeInTheDocument()
    expect(screen.getByTestId("layout-header-region")).toHaveAttribute("aria-hidden", "true")
    expect(screen.getByTestId("layout-header-region")).toHaveAttribute("inert")
    expect(screen.getByTestId("layout-header-region")).toHaveClass("duration-300", "grid-rows-[0fr]")
    expect(screen.getByTestId("layout-sidebar-region")).toHaveAttribute("aria-hidden", "true")
    expect(screen.getByTestId("layout-sidebar-region")).toHaveAttribute("inert")
    expect(screen.getByRole("button", { name: "exit content fullscreen" })).toBeEnabled()
    expect(screen.getByText("content")).toBeInTheDocument()
    if (orientation === "vertical") expect(screen.getByTestId("layout-main")).toHaveStyle({ marginLeft: "0px" })

    rerender(renderShell({ fixedHeaderTabs, fullContent: false, orientation }))
    expect(screen.getByText("header")).toBeInTheDocument()
    expect(screen.getByText("sidebar")).toBeInTheDocument()
    expect(screen.getByTestId("layout-header-region")).toHaveClass("grid-rows-[1fr]")
    expect(screen.getByTestId("layout-header-region")).not.toHaveAttribute("inert")
    expect(screen.getByTestId("layout-sidebar-region")).not.toHaveAttribute("inert")
    if (orientation === "vertical") expect(screen.getByTestId("layout-main")).toHaveStyle({ marginLeft: "220px" })
    if (orientation === "horizontal")
      expect(screen.getByTestId("layout-sidebar-region")).toHaveStyle({ width: "220px" })
  },
)
