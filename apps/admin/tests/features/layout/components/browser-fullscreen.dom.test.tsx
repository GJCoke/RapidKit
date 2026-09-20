// @vitest-environment jsdom

import { fireEvent, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, test, vi } from "vitest"
import i18n from "@/locales"
import { useLocaleStore } from "@/stores/locale"
import { renderAdmin } from "@test/setup/render"
import { HeaderTools } from "@/features/layout/components/header-tools"

const { notifyError } = vi.hoisted(() => ({ notifyError: vi.fn() }))

vi.mock("@rapidkit/ui/components/sonner", () => ({
  toast: { error: notifyError },
}))

interface AdapterHarness {
  adapter: import("@/features/layout/components/browser-fullscreen").FullscreenAdapter
  enter: ReturnType<typeof vi.fn>
  exit: ReturnType<typeof vi.fn>
  setFullscreenElement: (element: Element | null) => void
  emitChange: () => void
}

function createAdapterHarness(): AdapterHarness {
  let fullscreenElement: Element | null = null
  let listener: (() => void) | undefined
  const enter = vi.fn(async (element: HTMLElement) => {
    fullscreenElement = element
    listener?.()
  })
  const exit = vi.fn(async () => {
    fullscreenElement = null
    listener?.()
  })

  return {
    adapter: {
      getElement: () => fullscreenElement,
      request: enter,
      exit,
      subscribe: (nextListener) => {
        listener = nextListener
        return () => {
          listener = undefined
        }
      },
    },
    enter,
    exit,
    setFullscreenElement: (element) => {
      fullscreenElement = element
    },
    emitChange: () => listener?.(),
  }
}

afterEach(() => {
  notifyError.mockReset()
})

test("compact header tools registers navigable menu items and restores trigger focus after activation", async () => {
  const user = userEvent.setup()
  await i18n.changeLanguage("en-US")
  useLocaleStore.setState({ locale: "en-US" })
  renderAdmin(<HeaderTools isMobile />)

  const trigger = screen.getByRole("button", { name: "More header tools" })
  trigger.focus()
  await user.keyboard("{ArrowDown}")

  const menu = screen.getByRole("menu")
  const [browserFullscreen, locale, themeWorkbench] = within(menu).getAllByRole("menuitem")
  expect([browserFullscreen, locale, themeWorkbench].map((item) => item.textContent)).toEqual([
    "Enter browser fullscreen",
    "Switch language",
    "Theme workbench",
  ])
  expect(document.activeElement).toBe(browserFullscreen)

  await user.keyboard("{ArrowDown}")
  expect(document.activeElement).toBe(locale)
  await user.keyboard("{ArrowDown}")
  expect(document.activeElement).toBe(themeWorkbench)
  await user.keyboard("{ArrowUp}{ArrowUp}")
  expect(document.activeElement).toBe(browserFullscreen)

  await user.keyboard("{Enter}")

  await vi.waitFor(() => expect(notifyError).toHaveBeenCalledOnce())
  await vi.waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument())
  expect(document.activeElement).toBe(trigger)
})

test("keyboard activation opens the theme workbench from its compact menu item and restores overflow focus", async () => {
  const user = userEvent.setup()
  await i18n.changeLanguage("en-US")
  useLocaleStore.setState({ locale: "en-US" })
  renderAdmin(<HeaderTools isMobile />)

  const trigger = screen.getByRole("button", { name: "More header tools" })
  trigger.focus()
  await user.keyboard("{ArrowDown}")
  await user.keyboard("{ArrowDown}")
  await user.keyboard("{ArrowDown}")
  expect(document.activeElement).toHaveTextContent("Theme workbench")

  await user.keyboard("{Enter}")

  await vi.waitFor(() => expect(screen.getByRole("dialog", { name: "Theme workbench" })).toBeInTheDocument())
  expect(screen.queryByRole("menu")).not.toBeInTheDocument()

  await user.keyboard("{Escape}")

  await vi.waitFor(() => expect(screen.queryByRole("dialog", { name: "Theme workbench" })).not.toBeInTheDocument())
  expect(document.activeElement).toBe(trigger)
})

test("enters browser fullscreen only after the adapter reports a fullscreen element", async () => {
  const { BrowserFullscreen } = await import("@/features/layout/components/browser-fullscreen")
  const harness = createAdapterHarness()
  render(
    <BrowserFullscreen
      adapter={harness.adapter}
      enterLabel="Enter browser fullscreen"
      exitLabel="Exit browser fullscreen"
    />,
  )

  fireEvent.click(screen.getByRole("button", { name: "Enter browser fullscreen" }))

  await vi.waitFor(() => expect(harness.enter).toHaveBeenCalledWith(document.documentElement))
  expect(screen.getByRole("button", { name: "Exit browser fullscreen" })).toBeInTheDocument()
})

test("exits browser fullscreen through the adapter", async () => {
  const { BrowserFullscreen } = await import("@/features/layout/components/browser-fullscreen")
  const harness = createAdapterHarness()
  harness.setFullscreenElement(document.documentElement)
  render(
    <BrowserFullscreen
      adapter={harness.adapter}
      enterLabel="Enter browser fullscreen"
      exitLabel="Exit browser fullscreen"
    />,
  )

  fireEvent.click(screen.getByRole("button", { name: "Exit browser fullscreen" }))

  await vi.waitFor(() => expect(harness.exit).toHaveBeenCalledOnce())
  expect(screen.getByRole("button", { name: "Enter browser fullscreen" })).toBeInTheDocument()
})

test("keeps the enter state and reports a rejected browser fullscreen request", async () => {
  const { BrowserFullscreen } = await import("@/features/layout/components/browser-fullscreen")
  const harness = createAdapterHarness()
  harness.enter.mockRejectedValueOnce(new Error("denied"))
  render(
    <BrowserFullscreen
      adapter={harness.adapter}
      enterLabel="Enter browser fullscreen"
      exitLabel="Exit browser fullscreen"
    />,
  )

  fireEvent.click(screen.getByRole("button", { name: "Enter browser fullscreen" }))

  await vi.waitFor(() => expect(notifyError).toHaveBeenCalledOnce())
  expect(screen.getByRole("button", { name: "Enter browser fullscreen" })).toBeInTheDocument()
})

test("reports an unsupported browser fullscreen API without an unhandled rejection", async () => {
  const { BrowserFullscreen } = await import("@/features/layout/components/browser-fullscreen")
  const requestFullscreen = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "requestFullscreen")
  Object.defineProperty(HTMLElement.prototype, "requestFullscreen", { configurable: true, value: undefined })

  try {
    render(<BrowserFullscreen enterLabel="Enter browser fullscreen" exitLabel="Exit browser fullscreen" />)

    fireEvent.click(screen.getByRole("button", { name: "Enter browser fullscreen" }))

    await vi.waitFor(() => expect(notifyError).toHaveBeenCalledOnce())
    expect(screen.getByRole("button", { name: "Enter browser fullscreen" })).toBeInTheDocument()
  } finally {
    if (requestFullscreen) Object.defineProperty(HTMLElement.prototype, "requestFullscreen", requestFullscreen)
    else delete (HTMLElement.prototype as { requestFullscreen?: unknown }).requestFullscreen
  }
})

test("follows an external fullscreenchange event instead of assuming button success", async () => {
  const { BrowserFullscreen } = await import("@/features/layout/components/browser-fullscreen")
  const harness = createAdapterHarness()
  render(
    <BrowserFullscreen
      adapter={harness.adapter}
      enterLabel="Enter browser fullscreen"
      exitLabel="Exit browser fullscreen"
    />,
  )

  harness.setFullscreenElement(document.body)
  harness.emitChange()

  await vi.waitFor(() => expect(screen.getByRole("button", { name: "Exit browser fullscreen" })).toBeInTheDocument())

  harness.setFullscreenElement(null)
  harness.emitChange()

  await vi.waitFor(() => expect(screen.getByRole("button", { name: "Enter browser fullscreen" })).toBeInTheDocument())
})
