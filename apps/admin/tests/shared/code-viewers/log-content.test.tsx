// @vitest-environment jsdom
import "@test/setup/layout"
import { fireEvent, render, screen } from "@testing-library/react"
import { expect, test, vi } from "vitest"
import { LogContent } from "@/shared/code-viewers/log-content"
import { normalizeLogs } from "@/shared/code-viewers/log-model"
const rows = () =>
  normalizeLogs(
    undefined,
    Array.from({ length: 6 }, (_, index) => ({ id: index + 1, message: `line-${index + 1}` })),
  )
test("a paused reader keeps the same line and offset when earlier rows are evicted, then reports losing that line", () => {
  const onLost = vi.fn(),
    onFollow = vi.fn(),
    entries = rows(),
    props = {
      entries,
      retained: entries,
      height: 40,
      wrap: true,
      numbers: true,
      follow: false,
      label: "Stream",
      onLost,
      onFollow,
    },
    view = render(<LogContent {...props} />),
    container = screen.getByRole("log")
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const index = this.dataset.logKey ? Array.from(container.querySelectorAll("[data-log-key]")).indexOf(this) : 0,
      top = this.dataset.logKey ? index * 20 - container.scrollTop : 0
    return {
      top,
      bottom: top + (this.dataset.logKey ? 20 : 40),
      left: 0,
      right: 100,
      width: 100,
      height: this.dataset.logKey ? 20 : 40,
      x: 0,
      y: top,
      toJSON: () => ({}),
    }
  })
  Object.defineProperty(container, "clientHeight", { configurable: true, value: 40 })
  Object.defineProperty(container, "scrollHeight", {
    configurable: true,
    get: () => container.querySelectorAll("[data-log-key]").length * 20,
  })
  container.scrollTop = 42
  view.rerender(<LogContent {...props} entries={entries.slice(1)} retained={entries.slice(1)} />)
  expect(container.scrollTop).toBe(22)
  expect(onLost).not.toHaveBeenCalled()
  fireEvent.scroll(container)
  expect(onFollow).not.toHaveBeenCalled()
  fireEvent.wheel(container)
  fireEvent.scroll(container)
  expect(onFollow).toHaveBeenLastCalledWith(false)
  const replacement = normalizeLogs(undefined, [
    { id: 10, message: "new-one" },
    { id: 11, message: "new-two" },
  ])
  view.rerender(<LogContent {...props} entries={replacement} retained={replacement} />)
  expect(onLost).toHaveBeenCalledOnce()
})
test("filtering a still-retained anchor does not report eviction", () => {
  const entries = rows(),
    lost = vi.fn(),
    props = {
      entries,
      retained: entries,
      height: 40,
      wrap: true,
      numbers: true,
      follow: false,
      label: "Stream",
      onLost: lost,
      onFollow: vi.fn(),
    },
    view = render(<LogContent {...props} />),
    container = screen.getByRole("log")
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const index = this.dataset.logKey ? Array.from(container.querySelectorAll("[data-log-key]")).indexOf(this) : 0,
      top = index * 20 - container.scrollTop
    return { top, bottom: top + 20, left: 0, right: 100, width: 100, height: 20, x: 0, y: top, toJSON: () => ({}) }
  })
  container.scrollTop = 42
  view.rerender(<LogContent {...props} entries={entries.slice(4)} />)
  expect(lost).not.toHaveBeenCalled()
})
