// @vitest-environment jsdom

import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { fireEvent, render, screen } from "@testing-library/react"
import { CircleIcon } from "lucide-react"
import { expect, test, vi } from "vitest"

import { ChromePageTab } from "@/features/layout/components/chrome-page-tab"

test("lets each tab own divider visibility like frontend", async () => {
  const css = await readFile(
    resolve(process.cwd(), "src/features/layout/components/chrome-page-tab.module.css"),
    "utf8",
  )

  expect(css).toMatch(/\.active \.divider,[\s\S]*\.chromeTab:hover \.divider/)
  expect(css).not.toMatch(/:has\(/)
})

test("uses frontend selector order for hover and active stacking", async () => {
  const css = await readFile(
    resolve(process.cwd(), "src/features/layout/components/chrome-page-tab.module.css"),
    "utf8",
  )

  expect(css).toMatch(/\.chromeTab:hover\s*{[^}]*z-index:\s*9/s)
  expect(css).toMatch(/\.active\s*{[^}]*z-index:\s*10/s)
  expect(css).toMatch(/\.active:hover \.background\s*{[^}]*var\(--primary\)/s)
  expect(css).not.toMatch(/\.chromeTab:not\(\.active\):hover/)
})

test("matches frontend active background strength without adjacent hover bleed-through", async () => {
  const css = await readFile(
    resolve(process.cwd(), "src/features/layout/components/chrome-page-tab.module.css"),
    "utf8",
  )

  expect(css).toMatch(/var\(--primary\) 10%, var\(--background\) 90%/)
  expect(css).toMatch(/var\(--primary\) 30%, var\(--background\) 70%/)
  expect(css).not.toMatch(/var\(--primary\) (?:10|30)%, transparent/)
})

test("activates from primary pointer input with frontend-aligned presentation semantics", () => {
  const onActivate = vi.fn()

  render(
    <ChromePageTab
      active
      closable
      closeLabel="Close"
      icon={CircleIcon}
      label="System management"
      onActivate={onActivate}
      onClose={vi.fn()}
      onMiddleClick={vi.fn()}
    />,
  )

  const tab = screen.getByTestId("chrome-page-tab")
  expect(tab).not.toHaveAttribute("tabindex")
  expect(tab).not.toHaveAttribute("role")
  expect(tab).not.toHaveAttribute("aria-selected")
  expect(tab).toHaveAttribute("aria-current", "page")
  expect(tab).toHaveClass("relative", "-mr-[18px]")
  expect(tab).not.toHaveClass("isolate")
  expect(tab).toHaveClass("inline-flex", "px-6", "py-1.5", "text-[14px]", "leading-[21px]")
  expect(tab).not.toHaveClass("h-9", "text-xs", "font-medium")
  expect(screen.getByText("System management")).toHaveClass("truncate")
  const backgroundContainer = screen.getByTestId("chrome-tab-background-container")
  expect(backgroundContainer.parentElement).toBe(tab)
  expect(backgroundContainer).toHaveClass(
    "pointer-events-none",
    "absolute",
    "left-0",
    "top-0",
    "h-full",
    "w-full",
    "-z-[1]",
  )
  expect(backgroundContainer).toContainElement(screen.getByTestId("chrome-tab-background"))
  const divider = screen.getByTestId("chrome-tab-divider")
  expect(divider.parentElement).toBe(tab)
  expect(divider).toHaveClass("absolute", "right-[7px]", "h-4", "w-px")
  expect(tab.querySelector("svg:not([data-testid='chrome-tab-background'])")).toBeInTheDocument()

  fireEvent.pointerDown(tab, { button: 0 })
  expect(onActivate).toHaveBeenCalledTimes(1)

  fireEvent.pointerDown(tab, { button: 2 })
  expect(onActivate).toHaveBeenCalledTimes(1)
})

test("close control and middle click close without activating the tab", () => {
  const onActivate = vi.fn()
  const onClose = vi.fn()
  const onMiddleClick = vi.fn()

  render(
    <ChromePageTab
      active={false}
      closable
      closeLabel="Close"
      icon={CircleIcon}
      label="Users"
      onActivate={onActivate}
      onClose={onClose}
      onMiddleClick={onMiddleClick}
    />,
  )

  const closeButton = screen.getByRole("button", { name: "Close" })
  expect(closeButton).toHaveClass("size-4")
  expect(closeButton).not.toHaveClass("size-5", "opacity-60")
  expect(screen.getByTestId("chrome-page-tab")).toHaveClass("text-foreground")
  fireEvent.pointerDown(closeButton, { button: 0 })
  expect(onClose).toHaveBeenCalledTimes(1)
  expect(onActivate).not.toHaveBeenCalled()

  fireEvent(screen.getByTestId("chrome-page-tab"), new MouseEvent("auxclick", { bubbles: true, button: 1 }))
  expect(onMiddleClick).toHaveBeenCalledTimes(1)
  expect(onActivate).not.toHaveBeenCalled()
})

test("fixed tabs omit the close control and ignore middle click", () => {
  const onMiddleClick = vi.fn()

  render(
    <ChromePageTab
      active
      closable={false}
      closeLabel="Close"
      icon={CircleIcon}
      label="Home"
      onActivate={vi.fn()}
      onClose={vi.fn()}
      onMiddleClick={onMiddleClick}
    />,
  )

  expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument()
  fireEvent(screen.getByTestId("chrome-page-tab"), new MouseEvent("auxclick", { bubbles: true, button: 1 }))
  expect(onMiddleClick).not.toHaveBeenCalled()
})
